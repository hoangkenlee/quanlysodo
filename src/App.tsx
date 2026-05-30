import React, { useState, useEffect, useMemo, useRef, ChangeEvent } from 'react';
import { 
  FileUp, 
  Users, 
  BarChart3, 
  CalendarDays, 
  Search, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  Check,
  CheckCircle2,
  ChevronRight,
  Filter,
  Download,
  FolderOpen,
  Info,
  Save,
  X,
  LogIn,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Calendar,
  RefreshCw,
  CheckSquare
} from 'lucide-react';
import { 
  format, 
  parseISO, 
  parse,
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay,
  subMonths,
  addMonths,
  addDays,
  subDays,
  addYears,
  subYears
} from 'date-fns';
import { vi } from 'date-fns/locale';
import { AnimatePresence, motion } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { PLTFileRecord, Customer, CodeMapping } from './types';
import { parsePLT, calculateAdjustedDimensions } from './lib/pltParser';
import { dbService } from './services/dbService';
import { pdfService } from './services/pdfService';
import { excelService } from './services/excelService';
import { AuthForm } from './components/AuthForm';
import { getSupabase } from './lib/supabase';
import { User, Session } from '@supabase/supabase-js';
import JSZip from 'jszip';

// --- Helper: Extract Code from Filename ---
const extractCode = (fileName: string): string => {
  // 1. Remove extension
  let code = fileName.replace(/\.[a-zA-Z0-9]+$/g, '');
  
  // 2. Remove standard date patterns like dd-mm-yyyy, dd-mm-yy, dd_mm_yyyy, dd-mm, d_m
  // e.g. 8-4, 08-04, 2026, 8_4, 08/04, 15_12_26
  code = code.replace(/\b\d{1,2}[-_\/]\d{1,2}([-_\/]\d{2,4})?\b/g, '');
  
  // Remove isolated 4-digit years like 2025, 2026
  code = code.replace(/\b\d{4}\b/g, '');

  // Remove trailing/leading dates that don't have boundaries, e.g., "_0804" at end, or "0804_" at start
  code = code.replace(/[-_]\d{3,4}$/g, '');
  code = code.replace(/^\d{3,4}[-_]/g, '');

  // 3. Replace multiple spaces, underscores, or dashes with single space
  code = code.replace(/[\s-_\.]+/g, ' ').trim();
  
  // Fallback to original without extension if blank
  if (!code) {
    code = fileName.replace(/\.[a-zA-Z0-9]+$/g, '');
  }
  
  return code;
};

// --- Components ---

const TabButton = ({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-6 py-3 font-medium transition-all border-b-2 ${
      active 
        ? 'border-blue-600 text-blue-600 bg-blue-50/50' 
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
    }`}
  >
    <Icon size={18} />
    {label}
  </button>
);

interface CustomerTagProps {
  key?: string | number;
  name: string;
  onClick: () => void;
  active?: boolean;
}

const CustomerTag = ({ name, onClick, active }: CustomerTagProps) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
      active 
        ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
        : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:bg-blue-50'
    }`}
  >
    {name}
  </button>
);

// --- Main App ---

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'summary' | 'stats'>('upload');
  const [files, setFiles] = useState<PLTFileRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [codeMappings, setCodeMappings] = useState<CodeMapping[]>([]);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [isExtractingZip, setIsExtractingZip] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [expandedCustomerDay, setExpandedCustomerDay] = useState<{customerId: string, day: string} | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('archived_plt_ids');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Sync archivedIds to localStorage
  useEffect(() => {
    localStorage.setItem('archived_plt_ids', JSON.stringify(Array.from(archivedIds)));
  }, [archivedIds]);

  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isLoading?: boolean;
    type?: 'danger' | 'warning' | 'info';
  }>({ show: false, title: '', message: '', onConfirm: () => {} });
  const [invoiceModal, setInvoiceModal] = useState<{
    show: boolean;
    customerName: string;
    dateLabel: string;
    periodType: 'day' | 'month' | 'year';
    selectedDate: Date;
    unitPrice: string;
    designItems: {
      name: string;
      amount: string;
      notes: string;
      imageUrl?: string;
    }[];
  }>({ 
    show: false, 
    customerName: '', 
    dateLabel: '', 
    periodType: 'month',
    selectedDate: new Date(),
    unitPrice: '',
    designItems: [] 
  });
  
  // Auth state listener
  useEffect(() => {
    const supabase = getSupabase();
    
    // Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Clear messages after 5s
  useEffect(() => {
    if (operationError || successMessage) {
      const timer = setTimeout(() => {
        setOperationError(null);
        setSuccessMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [operationError, successMessage]);

  const historyFiles = useMemo(() => files.filter(f => !archivedIds.has(f.id)), [files, archivedIds]);

  const invoiceFiles = useMemo(() => {
    if (!invoiceModal.show || !invoiceModal.customerName) return [];
    
    return files.filter(f => {
      if (f.customerName !== invoiceModal.customerName) return false;
      const fileDateParsed = parseISO(f.fileDate);
      
      if (invoiceModal.periodType === 'day') {
        return format(fileDateParsed, 'dd/MM/yyyy') === format(invoiceModal.selectedDate, 'dd/MM/yyyy');
      } else if (invoiceModal.periodType === 'month') {
        return format(fileDateParsed, 'MM/yyyy') === format(invoiceModal.selectedDate, 'MM/yyyy');
      } else {
        return format(fileDateParsed, 'yyyy') === format(invoiceModal.selectedDate, 'yyyy');
      }
    });
  }, [files, invoiceModal.show, invoiceModal.customerName, invoiceModal.periodType, invoiceModal.selectedDate]);
  
  // Pending files to be classified
  const [pendingFiles, setPendingFiles] = useState<{
    tempId: string;
    file: File;
    code: string;
    suggestedCustomer: string;
    selectedCustomer: string;
    fileDate: string; // ISO string
    dimensions?: { width: number; length: number; adjusted: any };
  }[]>([]);
  const [uploadBehavior, setUploadBehavior] = useState<'append' | 'replace'>('append');
  const [uploadDateMode, setUploadDateMode] = useState<'file_date' | 'custom_date'>('file_date');
  const [customUploadDate, setCustomUploadDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [bulkChangeDate, setBulkChangeDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [activeTagPanelId, setActiveTagPanelId] = useState<string | null>(null);
  const tagPanelRef = useRef<HTMLDivElement>(null);
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(new Set());
  const [bulkCustomerName, setBulkCustomerName] = useState('');
  const savingTempIdsRef = useRef<Set<string>>(new Set());

  const groupedPending = useMemo(() => {
    const groups: { [key: string]: typeof pendingFiles } = {};
    pendingFiles.forEach(item => {
      let dateKey = 'Chưa rõ ngày';
      try {
        if (item.fileDate) {
          const d = parseISO(item.fileDate);
          dateKey = format(d, 'yyyy-MM-dd');
        }
      } catch (err) {
        dateKey = format(new Date(), 'yyyy-MM-dd');
      }
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(item);
    });
    
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(dateKey => {
        let formattedDate = dateKey;
        if (dateKey !== 'Chưa rõ ngày') {
          try {
            formattedDate = format(parse(dateKey, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy', { locale: vi });
          } catch (e) {
            formattedDate = dateKey;
          }
        }
        return {
          dateKey,
          formattedDate,
          items: groups[dateKey]
        };
      });
  }, [pendingFiles]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Handle clicking outside to close tag panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tagPanelRef.current && !tagPanelRef.current.contains(event.target as Node)) {
        setActiveTagPanelId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Helper: check if a file is duplicate (same name, original length, and original width on the same date)
  const findDuplicateInfo = (
    fileName: string,
    width: number,
    length: number,
    fileDateISO: string
  ) => {
    let targetDate: Date;
    try {
      targetDate = parseISO(fileDateISO);
    } catch {
      targetDate = new Date();
    }

    // Check ONLY with stored files ("Tổng quát" - files already assigned and saved successfully in DB)
    const dupInStored = files.find(f => {
      let fDate: Date;
      try {
        fDate = parseISO(f.fileDate);
      } catch {
        return false;
      }
      return isSameDay(targetDate, fDate) &&
        f.fileName.toLowerCase() === fileName.toLowerCase() &&
        Math.abs(f.originalWidth - width) < 0.1 &&
        Math.abs(f.originalLength - length) < 0.1;
    });

    if (dupInStored) {
      return { type: 'stored', record: dupInStored };
    }

    return null;
  };

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        setIsLoading(true);
        setFatalError(null);
        const [allFiles, allCustomers, allMappings] = await Promise.all([
          dbService.getFiles(),
          dbService.getCustomers(),
          dbService.getMappings()
        ]);

        setFiles(allFiles);
        setCustomers(allCustomers);
        setCodeMappings(allMappings);
      } catch (err) {
        console.error('Failed to load data:', err);
        setFatalError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra khi kết nối với Supabase.');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [user]);

  const handleLogout = async () => {
    await getSupabase().auth.signOut();
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 font-sans">
        <AuthForm onSuccess={() => {}} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center font-sans">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 font-medium">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (fatalError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-red-100 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="text-red-600" size={32} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Lỗi kết nối</h2>
          <p className="text-gray-600 mb-6">{fatalError}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors"
          >
            Thử lại ngay
          </button>
        </div>
      </div>
    );
  }

  const handleAddCustomer = async () => {
    const trimmedVal = newCustomerName.trim();
    if (!trimmedVal) return;
    
    // Check if customer already exists (case-insensitive)
    const existing = customers.find(c => c.name.toLowerCase() === trimmedVal.toLowerCase());
    if (existing) {
      setOperationError(`Khách hàng "${existing.name}" đã tồn tại trong danh sách!`);
      return;
    }
    
    try {
      setIsAddingCustomer(true);
      setOperationError(null);
      const added = await dbService.addCustomer(trimmedVal);
      setCustomers(prev => [...prev, added]);
      setNewCustomerName('');
      setSuccessMessage(`Đã thêm khách hàng "${added.name}" thành công.`);
    } catch (err: any) {
      console.error('Error adding customer:', err);
      setOperationError(err?.message || 'Lỗi khi thêm khách hàng mới.');
    } finally {
      setIsAddingCustomer(false);
    }
  };

  const handleRestoreDefaults = async () => {
    try {
      setIsProcessing(true);
      setOperationError(null);
      const defaultNames = [
        'Lan', 'Mai', 'Chị Phương', 'Thuỷ Hoàng', 'Loan Phú', 
        'Chị Vân vn', 'Long', 'Tuấn Linh', 'Ngọc Yến', 'Thuỳ Dương', 
        'Đăng', 'Thảo Vân', 'Thanh Tâm', 'AQ', 'Vân Thu', 'Trung Hoài'
      ];
      const restored = await dbService.restoreDefaultCustomers(defaultNames);
      if (restored.length > 0) {
        setCustomers(restored);
      } else {
        throw new Error('Không thể khôi phục danh sách mặc định.');
      }
    } catch (err: any) {
      console.error('Error restoring defaults:', err);
      setOperationError(err?.message || 'Lỗi khi khôi phục danh sách.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles) return;

    setIsProcessing(true);
    const newPending: typeof pendingFiles = [];
    const duplicateList: string[] = [];

    let resolvedDateISO = '';
    if (uploadDateMode === 'custom_date') {
      try {
        const parsedCustomDate = parse(customUploadDate, 'yyyy-MM-dd', new Date());
        resolvedDateISO = parsedCustomDate.toISOString();
      } catch (e) {
        resolvedDateISO = new Date().toISOString();
      }
    }

    try {
      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const fileNameLower = file.name.toLowerCase();

        // 1. Logic branch to handle .zip file
        if (fileNameLower.endsWith('.zip')) {
          setIsExtractingZip(true);
          try {
            const zipData = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(zipData);
            
            const zipEntries: { relativePath: string; fileEntry: any }[] = [];
            zip.forEach((relativePath, fileEntry) => {
              if (fileEntry.dir) return;
              const baseName = relativePath.split('/').pop() || relativePath;
              if (baseName.startsWith('._')) return; // ignore macOS metadata files
              
              const ext = baseName.toLowerCase();
              if (ext.endsWith('.plt') || ext.endsWith('.hpgl') || ext.endsWith('.hpg')) {
                zipEntries.push({ relativePath, fileEntry });
              }
            });

            const zipParsedItemsDef = zipEntries.map(async ({ relativePath, fileEntry }) => {
              const baseName = relativePath.split('/').pop() || relativePath;
              try {
                // Deduplicate inside the batch and pending queue
                const isDuplicate = newPending.some(p => p.file.name.toLowerCase() === baseName.toLowerCase()) ||
                                    pendingFiles.some(p => p.file.name.toLowerCase() === baseName.toLowerCase());
                if (isDuplicate) {
                  return null;
                }

                const content = await fileEntry.async('string');
                const { width, length } = parsePLT(content);
                const adjusted = calculateAdjustedDimensions(width, length);

                const code = extractCode(baseName);
                
                let suggested = '';
                const exactMapping = codeMappings.find(m => m.code.toLowerCase() === code.toLowerCase());
                if (exactMapping) {
                  suggested = exactMapping.customerName;
                } else {
                  const sortedMappings = [...codeMappings].sort((a, b) => b.code.length - a.code.length);
                  const codeLower = code.toLowerCase();
                  const substringMapping = sortedMappings.find(m => {
                    const mCodeLower = m.code.toLowerCase();
                    if (mCodeLower.length < 3) return false;
                    return codeLower.includes(mCodeLower) || mCodeLower.includes(codeLower);
                  });
                  if (substringMapping) {
                    suggested = substringMapping.customerName;
                  }
                }

                const isInitiallyAutoFilled = suggested !== '';

                let itemDate = resolvedDateISO;
                if (uploadDateMode === 'file_date') {
                  const entryDate = fileEntry.date instanceof Date ? fileEntry.date : new Date(file.lastModified || Date.now());
                  itemDate = entryDate.toISOString();
                }

                const mockFile = new File([content], baseName, { 
                  type: 'text/plain', 
                  lastModified: fileEntry.date instanceof Date ? fileEntry.date.getTime() : Date.now() 
                });

                return {
                  tempId: crypto.randomUUID(),
                  file: mockFile,
                  code,
                  suggestedCustomer: suggested,
                  selectedCustomer: suggested,
                  fileDate: itemDate,
                  isAutoFilled: isInitiallyAutoFilled,
                  dimensions: { width, length, adjusted }
                };
              } catch (err) {
                console.error(`Error parsing zip file entry ${baseName}:`, err);
                return null;
              }
            });

            const parsedZipEntries = (await Promise.all(zipParsedItemsDef)).filter(item => item !== null) as any[];
            newPending.push(...parsedZipEntries);
          } catch (zipErr) {
            console.error(`Error processing zip file ${file.name}:`, zipErr);
            setOperationError(`Lỗi khi giải nén tệp zip: ${file.name}`);
          } finally {
            setIsExtractingZip(false);
          }
        }
        // 2. Original logic branch for regular files
        else if (fileNameLower.endsWith('.plt') || fileNameLower.endsWith('.hpgl') || fileNameLower.endsWith('.hpg')) {
          // Deduplicate inside the batch and pending queue
          const isDuplicate = newPending.some(p => p.file.name.toLowerCase() === file.name.toLowerCase()) ||
                              pendingFiles.some(p => p.file.name.toLowerCase() === file.name.toLowerCase());
          if (isDuplicate) {
            console.log(`Skipping duplicate file in selection: ${file.name}`);
            continue;
          }

          const code = extractCode(file.name);
          
          // Intelligent robust mapping lookup
          let suggested = '';
          const exactMapping = codeMappings.find(m => m.code.toLowerCase() === code.toLowerCase());
          if (exactMapping) {
            suggested = exactMapping.customerName;
          } else {
            const sortedMappings = [...codeMappings].sort((a, b) => b.code.length - a.code.length);
            const codeLower = code.toLowerCase();
            const substringMapping = sortedMappings.find(m => {
              const mCodeLower = m.code.toLowerCase();
              if (mCodeLower.length < 3) return false;
              return codeLower.includes(mCodeLower) || mCodeLower.includes(codeLower);
            });
            if (substringMapping) {
              suggested = substringMapping.customerName;
            }
          }

          const isInitiallyAutoFilled = suggested !== '';

          try {
            const content = await file.text();
            const { width, length } = parsePLT(content);
            const adjusted = calculateAdjustedDimensions(width, length);

            let itemDate = resolvedDateISO;
            if (uploadDateMode === 'file_date') {
              itemDate = new Date(file.lastModified || Date.now()).toISOString();
            }

            // No auto-removal of duplicates here. We parse and keep files in the queue
            newPending.push({
              tempId: crypto.randomUUID(),
              file,
              code,
              suggestedCustomer: suggested,
              selectedCustomer: suggested,
              fileDate: itemDate,
              isAutoFilled: isInitiallyAutoFilled,
              dimensions: { width, length, adjusted }
            });
          } catch (error) {
            console.error(`Error parsing file ${file.name}:`, error);
          }
        }
      }

      if (uploadBehavior === 'replace') {
        setPendingFiles(newPending);
        setSelectedPendingIds(new Set(newPending.map(p => p.tempId)));
      } else {
        setPendingFiles(prev => [...prev, ...newPending]);
      }
    } catch (err: any) {
      console.error('Error in handleFileSelection:', err);
      setOperationError('Đã xảy ra lỗi trong quá trình tải tệp lên.');
    } finally {
      setIsProcessing(false);
      setIsExtractingZip(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  const handleBulkAssign = async () => {
    if (isProcessing || !bulkCustomerName.trim() || selectedPendingIds.size === 0) return;
    
    const trimmedName = bulkCustomerName.trim();
    const successfulTempIds: string[] = [];
    const newRecords: PLTFileRecord[] = [];
    const addedMappings: { code: string, customerName: string }[] = [];
    const skippedFiles: string[] = [];

    setIsProcessing(true);
    setOperationError(null);
    setSuccessMessage(null);

    try {
      // Add to customers if new
      if (!customers.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
        const added = await dbService.addCustomer(trimmedName);
        setCustomers(prev => [...prev, added]);
      }

      for (const tempId of Array.from(selectedPendingIds)) {
        const pending = pendingFiles.find(p => p.tempId === (tempId as string));
        if (!pending || !pending.dimensions) continue;

        if (savingTempIdsRef.current.has(pending.tempId)) {
          continue;
        }
        savingTempIdsRef.current.add(pending.tempId);

        try {
          // Update mapping
          await dbService.updateMapping(pending.code, trimmedName);
          addedMappings.push({ code: pending.code, customerName: trimmedName });

          // Add file
          const addedFile = await dbService.addFile({
            fileName: pending.file.name,
            customerName: trimmedName,
            originalWidth: pending.dimensions.width,
            originalLength: pending.dimensions.length,
            adjustedLength: pending.dimensions.adjusted.adjustedLength,
            isOverWidth: pending.dimensions.adjusted.isOverWidth,
            fileDate: pending.fileDate
          });
          
          newRecords.push(addedFile);
          successfulTempIds.push(tempId as string);
        } catch (fileErr) {
          console.error(`Error processing bulk file ${pending.file.name}:`, fileErr);
          savingTempIdsRef.current.delete(pending.tempId);
        }
      }

      if (newRecords.length > 0) {
        setFiles(prev => [...newRecords, ...prev].sort((a, b) => 
          new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime()
        ));
        
        setSuccessMessage(`Đã gán và lưu thành công ${newRecords.length} sơ đồ.`);
      }

      // Update local mappings
      setCodeMappings(prev => {
        const next = [...prev];
        addedMappings.forEach(am => {
          const idx = next.findIndex(m => m.code === am.code);
          if (idx >= 0) next[idx].customerName = am.customerName;
          else next.push({ code: am.code, customerName: am.customerName });
        });
        return next;
      });

      // Remove successful from pending
      setPendingFiles(prev => prev.filter(p => !successfulTempIds.includes(p.tempId)));
      setSelectedPendingIds(new Set());
      setBulkCustomerName('');

    } catch (err: any) {
      console.error('Error in handleBulkAssign:', err);
      setOperationError('Lỗi khi xử lý gán hàng loạt.');
    } finally {
      setIsProcessing(false);
      pendingFiles.forEach(p => savingTempIdsRef.current.delete(p.tempId));
    }
  };

  const toggleSelectAll = () => {
    if (selectedPendingIds.size === pendingFiles.length) {
      setSelectedPendingIds(new Set());
    } else {
      setSelectedPendingIds(new Set(pendingFiles.map(p => p.tempId)));
    }
  };

  const handleExportInvoice = (customerName: string, refDate: Date = currentMonth, initialPeriod: 'day' | 'month' | 'year' = 'month') => {
    setInvoiceModal({
      show: true,
      customerName,
      dateLabel: '',
      periodType: initialPeriod,
      selectedDate: refDate,
      unitPrice: '',
      designItems: []
    });
  };

  const confirmExportInvoice = async () => {
    const unitPriceValue = invoiceModal.unitPrice ? parseInt(invoiceModal.unitPrice.replace(/\D/g, ''), 10) : undefined;
    const dateLabel = invoiceModal.periodType === 'day' 
      ? `Ngày ${format(invoiceModal.selectedDate, 'dd/MM/yyyy')}`
      : invoiceModal.periodType === 'month' 
      ? `Tháng ${format(invoiceModal.selectedDate, 'MM/yyyy')}`
      : `Năm ${format(invoiceModal.selectedDate, 'yyyy')}`;
    
    try {
      await pdfService.generateInvoice({
        customerName: invoiceModal.customerName,
        date: dateLabel,
        files: invoiceFiles.map(f => ({
          fileName: f.fileName,
          width: f.originalWidth,
          length: f.originalLength,
          adjustedLength: f.adjustedLength,
          fileDate: f.fileDate
        })),
        totalLength: invoiceFiles.reduce((acc, f) => acc + f.adjustedLength, 0),
        unitPrice: unitPriceValue,
        designItems: invoiceModal.designItems.map(item => ({
          name: item.name,
          amount: parseInt(item.amount.replace(/\D/g, '') || '0', 10),
          notes: item.notes,
          imageUrl: item.imageUrl
        }))
      });
      
      setInvoiceModal(prev => ({ ...prev, show: false }));
      setSuccessMessage('Đã tạo hoá đơn PDF thành công!');
    } catch (error) {
      console.error('Lỗi khi tạo PDF:', error);
      setOperationError('Không thể tạo hoá đơn PDF. Vui lòng thử lại.');
    }
  };

  const confirmExportExcel = async () => {
    const unitPriceValue = invoiceModal.unitPrice ? parseInt(invoiceModal.unitPrice.replace(/\D/g, ''), 10) : undefined;
    const dateLabel = invoiceModal.periodType === 'day' 
      ? `Ngày ${format(invoiceModal.selectedDate, 'dd/MM/yyyy')}`
      : invoiceModal.periodType === 'month' 
      ? `Tháng ${format(invoiceModal.selectedDate, 'MM/yyyy')}`
      : `Năm ${format(invoiceModal.selectedDate, 'yyyy')}`;
    
    try {
      excelService.generateInvoice({
        customerName: invoiceModal.customerName,
        date: dateLabel,
        files: invoiceFiles.map(f => ({
          fileName: f.fileName,
          width: f.originalWidth,
          length: f.originalLength,
          adjustedLength: f.adjustedLength,
          fileDate: f.fileDate
        })),
        totalLength: invoiceFiles.reduce((acc, f) => acc + f.adjustedLength, 0),
        unitPrice: unitPriceValue,
        designItems: invoiceModal.designItems.map(item => ({
          name: item.name,
          amount: parseInt(item.amount.replace(/\D/g, '') || '0', 10),
          notes: item.notes,
          imageUrl: item.imageUrl
        }))
      });
      
      setInvoiceModal(prev => ({ ...prev, show: false }));
      setSuccessMessage('Đã tạo hoá đơn Excel thành công!');
    } catch (error) {
      console.error('Lỗi khi tạo Excel:', error);
      setOperationError('Không thể tạo hoá đơn Excel. Vui lòng thử lại.');
    }
  };

  const addDesignItem = () => {
    setInvoiceModal(prev => ({
      ...prev,
      designItems: [...prev.designItems, { name: '', amount: '', notes: '', imageUrl: '' }]
    }));
  };

  const removeDesignItem = (index: number) => {
    setInvoiceModal(prev => ({
      ...prev,
      designItems: prev.designItems.filter((_, i) => i !== index)
    }));
  };

  const updateDesignItem = (index: number, field: string, value: string) => {
    setInvoiceModal(prev => {
      const next = [...prev.designItems];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, designItems: next };
    });
  };

  const handleDesignImageUpload = (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setOperationError('Ảnh quá lớn (tối đa 2MB)');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      updateDesignItem(index, 'imageUrl', reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const toggleSelectFile = (id: string) => {
    setSelectedPendingIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmClassification = async () => {
    if (isProcessing) return;

    const newRecords: PLTFileRecord[] = [];
    const addedMappings: { code: string, customerName: string }[] = [];
    const successfulTempIds: string[] = [];
    const skippedFiles: string[] = [];

    setIsProcessing(true);
    setOperationError(null);
    setSuccessMessage(null);

    try {
      for (const pending of pendingFiles) {
        const trimmedName = pending.selectedCustomer.trim();
        if (!trimmedName || !pending.dimensions) continue;

        if (savingTempIdsRef.current.has(pending.tempId)) {
          continue;
        }
        savingTempIdsRef.current.add(pending.tempId);

        try {
          // Add to customers if new
          if (!customers.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
            const added = await dbService.addCustomer(trimmedName);
            setCustomers(prev => [...prev, added]);
          }

          // Update mappings in DB
          await dbService.updateMapping(pending.code, trimmedName);
          addedMappings.push({ code: pending.code, customerName: trimmedName });

          // Add to records in DB
          const addedFile = await dbService.addFile({
            fileName: pending.file.name,
            customerName: trimmedName,
            originalWidth: pending.dimensions.width,
            originalLength: pending.dimensions.length,
            adjustedLength: pending.dimensions.adjusted.adjustedLength,
            isOverWidth: pending.dimensions.adjusted.isOverWidth,
            fileDate: pending.fileDate
          });
          newRecords.push(addedFile);
          successfulTempIds.push(pending.tempId);
        } catch (fileErr) {
          console.error(`Error processing file ${pending.file.name}:`, fileErr);
          savingTempIdsRef.current.delete(pending.tempId);
        }
      }

      if (newRecords.length > 0) {
        setFiles(prev => [...newRecords, ...prev].sort((a, b) => 
          new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime()
        ));
        setSuccessMessage(`Đã lưu thành công ${newRecords.length} sơ đồ.`);
      }
      
      // Update local mappings state
      setCodeMappings(prev => {
        const next = [...prev];
        addedMappings.forEach(am => {
          const idx = next.findIndex(m => m.code === am.code);
          if (idx >= 0) next[idx].customerName = am.customerName;
          else next.push({ code: am.code, customerName: am.customerName });
        });
        return next;
      });

      // ONLY remove successful files from pending
      setPendingFiles(prev => prev.filter(p => !successfulTempIds.includes(p.tempId)));
      setSelectedPendingIds(prev => {
        const next = new Set(prev);
        successfulTempIds.forEach(id => next.delete(id));
        return next;
      });

      if (successfulTempIds.length < pendingFiles.length && successfulTempIds.length > 0) {
        setOperationError(`Lưu được ${successfulTempIds.length} file, còn ${pendingFiles.length - successfulTempIds.length} file chưa có thông tin khách hàng hoặc gặp lỗi.`);
      }
    } catch (err: any) {
      console.error('Error confirming classification:', err);
      setOperationError('Đã có lỗi xảy ra trong quá trình lưu dữ liệu.');
    } finally {
      setIsProcessing(false);
      pendingFiles.forEach(p => savingTempIdsRef.current.delete(p.tempId));
    }
  };

  const updatePendingCustomerById = (tempId: string, customerName: string, isAutoFilled?: boolean) => {
    setPendingFiles(prev => prev.map(p => 
      p.tempId === tempId ? { ...p, selectedCustomer: customerName, isAutoFilled: isAutoFilled !== undefined ? isAutoFilled : false } : p
    ));
  };

  const updatePendingDateById = (tempId: string, newDateISO: string) => {
    const pending = pendingFiles.find(p => p.tempId === tempId);
    if (!pending || !pending.dimensions) return;

    setPendingFiles(prev => prev.map(p => 
      p.tempId === tempId ? { ...p, fileDate: newDateISO } : p
    ));
    setSuccessMessage('Đã cập nhật ngày thành công.');
  };

  const updateFileCustomer = async (fileId: string, newCustomerName: string) => {
    const trimmedName = newCustomerName.trim();
    if (!trimmedName) return;

    try {
      setOperationError(null);
      await dbService.updateFileCustomer(fileId, trimmedName);
      
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, customerName: trimmedName } : f
      ));
  
      // Also update customers list if it's a new name
      if (!customers.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
        const added = await dbService.addCustomer(trimmedName);
        if (added) setCustomers(prev => [...prev, added]);
      }
    } catch (err: any) {
      console.error('Error updating file customer:', err);
      setOperationError('Lỗi khi cập nhật tên khách hàng cho file.');
    }
  };

  const handleSaveSingleFile = async (tempId: string) => {
    const pending = pendingFiles.find(p => p.tempId === tempId);
    if (!pending || !pending.selectedCustomer.trim() || !pending.dimensions) return;

    if (savingTempIdsRef.current.has(tempId)) {
      console.log('Skipping concurrent save for file:', pending.file.name);
      return;
    }
    savingTempIdsRef.current.add(tempId);

    const trimmedName = pending.selectedCustomer.trim();

    try {
      setIsProcessing(true);
      setOperationError(null);
      setSuccessMessage(null);
      // Add to customers if new
      if (!customers.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
        const added = await dbService.addCustomer(trimmedName);
        if (added) setCustomers(prev => [...prev, added]);
      }
  
      // Update mappings in DB
      await dbService.updateMapping(pending.code, trimmedName);
      
      // Update local mappings
      setCodeMappings(prev => {
        const next = [...prev];
        const idx = next.findIndex(m => m.code === pending.code);
        if (idx >= 0) next[idx].customerName = trimmedName;
        else next.push({ code: pending.code, customerName: trimmedName });
        return next;
      });
  
      // Add to records in DB
      const addedFile = await dbService.addFile({
        fileName: pending.file.name,
        customerName: trimmedName,
        originalWidth: pending.dimensions!.width,
        originalLength: pending.dimensions!.length,
        adjustedLength: pending.dimensions!.adjusted.adjustedLength,
        isOverWidth: pending.dimensions!.adjusted.isOverWidth,
        fileDate: pending.fileDate
      });
  
      setFiles(prev => [addedFile, ...prev].sort((a, b) => 
        new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime()
      ));
  
      setSuccessMessage(`Đã lưu file "${addedFile.fileName}" thành công.`);
      setPendingFiles(prev => prev.filter(p => p.tempId !== tempId));
      setSelectedPendingIds(prev => {
        const next = new Set(prev);
        next.delete(tempId);
        return next;
      });
    } catch (err: any) {
      console.error('Error saving single file:', err);
      setOperationError('Lỗi khi lưu file này. Vui lòng thử lại.');
    } finally {
      setIsProcessing(false);
      savingTempIdsRef.current.delete(tempId);
    }
  };

  const toggleSelectHistoryFile = (id: string) => {
    setSelectedHistoryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllHistory = () => {
    if (selectedHistoryIds.size === files.length && files.length > 0) {
      setSelectedHistoryIds(new Set());
    } else {
      setSelectedHistoryIds(new Set(files.map(f => f.id)));
    }
  };

  const handleBulkDeleteHistory = async () => {
    if (selectedHistoryIds.size === 0) return;
    
    setConfirmModal({
      show: true,
      title: 'Xác nhận xoá lịch sử',
      message: `Bạn có chắc chắn muốn xoá ${selectedHistoryIds.size} file đã chọn khỏi danh sách lịch sử? Dữ liệu này sẽ KHÔNG bị mất trong phần Tổng quát / Thống kê.`,
      type: 'warning',
      onConfirm: async () => {
        setIsProcessing(true);
        setConfirmModal(prev => ({ ...prev, isLoading: true }));
        
        try {
          const idsToArchive = Array.from(selectedHistoryIds) as string[];
          
          setArchivedIds(prev => {
            const next = new Set(prev);
            idsToArchive.forEach(id => next.add(id));
            return next;
          });

          setSelectedHistoryIds(new Set());
          setSuccessMessage(`Đã ẩn thành công ${idsToArchive.length} file khỏi lịch sử.`);
        } catch (err) {
          console.error('Error in bulk archive history:', err);
          setOperationError('Lỗi khi thực hiện xoá lịch sử.');
        } finally {
          setIsProcessing(true); // Keep it busy for a tiny bit if needed, but actually archive is fast
          setTimeout(() => {
            setIsProcessing(false);
            setConfirmModal({ show: false, title: '', message: '', onConfirm: () => {} });
          }, 300);
        }
      }
    });
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  // --- Stats Logic ---
  const getStatsData = () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    
    const monthlyFiles = files.filter(f => {
      const d = parseISO(f.fileDate);
      return d >= start && d <= end;
    });

    const customerStats = customers.map(c => {
      const customerFiles = monthlyFiles.filter(f => f.customerName && c && f.customerName.trim().toLowerCase() === c.name.trim().toLowerCase());
      const totalLength = customerFiles.reduce((acc, f) => acc + f.adjustedLength, 0);
      return {
        name: c.name,
        totalLength: Number(totalLength.toFixed(2)),
        count: customerFiles.length
      };
    }).filter(s => s.count > 0);

    return customerStats;
  };

  const getDailyStats = () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });

    return days.map(day => {
      const dayFiles = files.filter(f => isSameDay(parseISO(f.fileDate), day));
      const totalLength = dayFiles.reduce((acc, f) => acc + f.adjustedLength, 0);
      return {
        date: format(day, 'dd/MM'),
        totalLength: Number(totalLength.toFixed(2))
      };
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Success notification toast */}
      {successMessage && (
        <div className="fixed top-20 right-4 z-[60] animate-in slide-in-from-right-4 fade-in duration-300">
          <div className="bg-green-600 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-green-500">
            <CheckCircle2 size={20} className="shrink-0" />
            <div className="flex flex-col">
              <span className="font-bold text-sm">Thành công</span>
              <span className="text-xs opacity-90">{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="ml-2 hover:bg-white/20 p-1 rounded">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Non-fatal operation error toast */}
      {operationError && (
        <div className="fixed top-20 right-4 z-[60] animate-in slide-in-from-right-4 fade-in duration-300">
          <div className="bg-red-600 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-red-500">
            <AlertTriangle size={20} className="shrink-0" />
            <div className="flex flex-col">
              <span className="font-bold text-sm">Lỗi thao tác</span>
              <span className="text-xs opacity-90">{operationError}</span>
            </div>
            <button onClick={() => setOperationError(null)} className="ml-2 hover:bg-white/20 p-1 rounded">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {fatalError && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-md shadow-xl">
            <AlertTriangle className="text-red-600 mx-auto mb-4" size={48} />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Lỗi kết nối cơ sở dữ liệu</h2>
            <p className="text-gray-600 mb-6">{fatalError}</p>
            <div className="bg-white p-4 rounded-lg border border-gray-100 text-left text-sm mb-6 max-h-[300px] overflow-y-auto">
              {fatalError?.includes('relation') || fatalError?.includes('user_id') || fatalError?.includes('PGRST204') ? (
                <>
                  <p className="font-semibold text-red-700 mb-2">Lỗi cấu trúc Database (Supabase)!</p>
                  <p className="text-gray-600 mb-2">Hãy chạy các lệnh SQL sau trong <strong>Supabase SQL Editor</strong>:</p>
                  <pre className="bg-gray-900 text-gray-100 p-3 rounded text-[10px] whitespace-pre-wrap">
{`-- 1. Nếu đã có bảng nhưng thiếu cột user_id (Migration)
alter table customers add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table code_mappings add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table plt_files add column if not exists user_id uuid references auth.users(id) default auth.uid();

-- 2. Nếu chưa có bảng (Setup mới)
create table if not exists customers (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null default auth.uid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists code_mappings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null default auth.uid(),
  code text not null,
  customer_name text not null,
  created_at timestamptz default now(),
  unique (user_id, code)
);

create table if not exists plt_files (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null default auth.uid(),
  file_name text not null,
  customer_name text not null,
  original_width float8,
  original_length float8,
  adjusted_length float8,
  is_over_width boolean,
  file_date timestamptz,
  created_at timestamptz default now()
);

-- 3. Xoá policy cũ (nếu có)
drop policy if exists "Allow all customers" on customers;
drop policy if exists "Allow all mappings" on code_mappings;
drop policy if exists "Allow all files" on plt_files;

-- 4. RLS & Policy mới
alter table customers enable row level security;
alter table code_mappings enable row level security;
alter table plt_files enable row level security;

create policy "Users manage own customers" on customers for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own mappings" on code_mappings for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own files" on plt_files for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);`}
                  </pre>
                </>
              ) : (
                <>
                  <p className="font-semibold text-gray-700 mb-1">Cách khắc phục:</p>
                  <ol className="list-decimal list-inside space-y-1 text-gray-500">
                    <li>Kiểm tra <strong>VITE_SUPABASE_URL</strong> và <strong>VITE_SUPABASE_ANON_KEY</strong> trong Secrets.</li>
                    <li>Đảm bảo các bảng đã được tạo và RLS policy đã được thiết lập (cho phép người dùng đã xác thực).</li>
                    <li>Làm mới trang web.</li>
                  </ol>
                </>
              )}
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-blue-700 transition-colors shadow-lg"
            >
              Thử lại
            </button>
          </div>
        </div>
      )}
      {isLoading && !fatalError && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent shadow-lg mb-4"></div>
          <p className="text-blue-600 font-bold animate-pulse">Đang tải dữ liệu từ Supabase...</p>
        </div>
      )}
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-100">
                <FileUp className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-gray-900">PLT Manager</h1>
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider text-left">Garber Tech Solution</p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="hidden md:flex bg-gray-100 p-1 rounded-xl items-center">
                <TabButton 
                  active={activeTab === 'upload'} 
                  onClick={() => setActiveTab('upload')} 
                  icon={FolderOpen} 
                  label="Nhập & Phân loại" 
                />
                <TabButton 
                  active={activeTab === 'summary'} 
                  onClick={() => setActiveTab('summary')} 
                  icon={CalendarDays} 
                  label="Tổng quát" 
                />
                <TabButton 
                  active={activeTab === 'stats'} 
                  onClick={() => setActiveTab('stats')} 
                  icon={BarChart3} 
                  label="Thống kê" 
                />
              </div>

              <div className="flex items-center gap-3 pl-6 border-l border-gray-200">
                <div className="hidden lg:block text-right leading-tight">
                  <p className="text-sm font-bold text-gray-900">{user?.email?.split('@')[0]}</p>
                  <p className="text-[10px] text-gray-400">{user?.email}</p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  title="Đăng xuất"
                >
                  <LogIn size={20} className="rotate-180" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Module 1: Upload & Classification */}
        {activeTab === 'upload' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left: Customer & Upload */}
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Users size={20} className="text-blue-600" />
                      Khách hàng
                    </h2>
                    {customers.length === 0 && (
                      <button 
                        onClick={handleRestoreDefaults}
                        className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-wider"
                      >
                        Khôi phục mẫu
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      placeholder="Tên khách hàng mới..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddCustomer()}
                      disabled={isAddingCustomer}
                    />
                    <button
                      onClick={handleAddCustomer}
                      disabled={isAddingCustomer}
                      className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center min-w-[40px]"
                    >
                      {isAddingCustomer ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      ) : (
                        <Plus size={20} />
                      )}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                    {customers.map(customer => (
                      <span 
                        key={customer.id} 
                        className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium border border-gray-200"
                      >
                        {customer.name}
                        <button 
                          onClick={async () => {
                            try {
                              setOperationError(null);
                              if (await dbService.deleteCustomer(customer.id)) {
                                setCustomers(customers.filter(c => c.id !== customer.id))
                              } else {
                                throw new Error('Không thể xóa khách hàng này.');
                              }
                            } catch (err: any) {
                              setOperationError(err?.message || 'Lỗi khi xóa khách hàng.');
                            }
                          }}
                          className="hover:text-red-600"
                        >
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                    {customers.length === 0 ? (
                      <div className="w-full py-4 text-center">
                        <p className="text-sm text-gray-400 italic mb-2">Chưa có khách hàng</p>
                        <button 
                          onClick={handleRestoreDefaults}
                          className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-100 transition-colors"
                        >
                          Nạp danh sách mặc định
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={handleRestoreDefaults}
                        className="w-full mt-2 text-[10px] font-bold text-gray-400 hover:text-blue-600 uppercase tracking-wider text-center"
                      >
                        Khôi phục danh sách gốc
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                  <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <FileUp size={20} className="text-blue-600" />
                    Nhập File PLT / HPGL / HPG
                  </h2>

                  {/* Upload Settings Widget */}
                  <div className="mb-4 bg-gray-50 p-3.5 rounded-xl border border-gray-200/60 space-y-3.5">
                    <div>
                      <span className="block text-[10px] font-bold text-gray-450 uppercase tracking-wider mb-2">Mỗi lần tải file mới lên:</span>
                      <div className="grid grid-cols-2 gap-2 bg-gray-100 p-0.5 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setUploadBehavior('append')}
                          className={`py-1.5 text-[11px] font-bold rounded-md transition-all ${
                            uploadBehavior === 'append'
                              ? 'bg-white text-blue-600 shadow-xs'
                              : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          Cộng dồn (+)
                        </button>
                        <button
                          type="button"
                          onClick={() => setUploadBehavior('replace')}
                          className={`py-1.5 text-[11px] font-bold rounded-md transition-all ${
                            uploadBehavior === 'replace'
                              ? 'bg-white text-red-600 shadow-xs'
                              : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          Làm mới (Reset)
                        </button>
                      </div>
                    </div>

                    <div>
                      <span className="block text-[10px] font-bold text-gray-450 uppercase tracking-wider mb-1.5">Cách gán ngày cho file mới:</span>
                      <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="uploadDateMode"
                            checked={uploadDateMode === 'file_date'}
                            onChange={() => setUploadDateMode('file_date')}
                            className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 rounded-full border-gray-300"
                          />
                          <span className="text-xs text-gray-600 font-medium">Sử dụng ngày gốc của file</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="uploadDateMode"
                            checked={uploadDateMode === 'custom_date'}
                            onChange={() => setUploadDateMode('custom_date')}
                            className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 rounded-full border-gray-300"
                          />
                          <span className="text-xs text-gray-600 font-medium">Gán một ngày cụ thể</span>
                        </label>
                        
                        {uploadDateMode === 'custom_date' && (
                          <div className="mt-1 animate-in fade-in duration-205">
                            <input
                              type="date"
                              value={customUploadDate}
                              onChange={(e) => setCustomUploadDate(e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-800 font-bold"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer bg-blue-50/30 border-blue-200 hover:bg-blue-50/50 hover:border-blue-400 group"
                    >
                      <FileUp size={32} className="mx-auto mb-2 text-blue-500 group-hover:scale-110 transition-transform" />
                      <p className="font-medium text-gray-700 text-sm">Chọn nhiều file</p>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelection}
                        multiple
                        accept=".plt,.hpgl,.hpg,.zip,application/zip,application/x-zip-compressed"
                        className="hidden"
                      />
                    </div>

                    <div 
                      onClick={() => folderInputRef.current?.click()}
                      className="border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer bg-purple-50/30 border-purple-200 hover:bg-purple-50/50 hover:border-purple-400 group"
                    >
                      <FolderOpen size={32} className="mx-auto mb-2 text-purple-500 group-hover:scale-110 transition-transform" />
                      <p className="font-medium text-gray-700 text-sm">Chọn nguyên thư mục</p>
                      <input
                        type="file"
                        ref={folderInputRef}
                        onChange={handleFileSelection}
                        webkitdirectory=""
                        directory=""
                        className="hidden"
                      />
                    </div>
                  </div>
                  
                  <p className="text-[10px] text-gray-400 mt-3 text-center italic">
                    Hệ thống sẽ tự trích xuất mã và gợi ý khách hàng
                  </p>
                  {isProcessing && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-blue-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                      <span className="text-sm font-medium">Đang phân tích file...</span>
                    </div>
                  )}
                  {isExtractingZip && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-indigo-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent"></div>
                      <span className="text-sm font-medium">Đang giải nén và phân tích tệp ZIP...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Classification Area */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="p-6 border-b border-gray-100 flex flex-col gap-4 bg-white">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <h2 className="text-lg font-semibold flex items-center gap-2">
                        <span>Phân loại & Xác nhận</span>
                        {pendingFiles.length > 0 && (
                          <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100/50 animate-pulse">
                            {pendingFiles.length} file chờ
                          </span>
                        )}
                      </h2>
                       {pendingFiles.length > 0 && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => {
                              setPendingFiles([]);
                              setSelectedPendingIds(new Set());
                              setSuccessMessage('Đã xoá sạch danh sách chờ gán.');
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-all text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Xoá toàn bộ file trong danh sách phân loại hiện tại"
                          >
                            <RefreshCw size={14} />
                            Xoá danh sách
                          </button>
                          
                          <button 
                            type="button"
                            disabled={isProcessing}
                            onClick={handleConfirmClassification}
                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <CheckSquare size={14} />
                            Lưu tất cả ({pendingFiles.length} file)
                          </button>
                        </div>
                      )}
                    </div>

                    {pendingFiles.length > 0 && (
                      <div className="flex flex-col gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <datalist id="customer-suggestions">
                          {customers.map(c => (
                            <option key={c.id} value={c.name} />
                          ))}
                        </datalist>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={selectedPendingIds.size === pendingFiles.length && pendingFiles.length > 0}
                              onChange={toggleSelectAll}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-600">Chọn tất cả</span>
                          </div>
                          
                          <div className="h-4 w-px bg-gray-300 mx-2" />
                          
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              list="customer-suggestions"
                              value={bulkCustomerName}
                              onChange={(e) => setBulkCustomerName(e.target.value)}
                              placeholder="Gán nhanh khách hàng cho các file đã chọn..."
                              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                              disabled={selectedPendingIds.size === 0}
                            />
                            <button
                              onClick={handleBulkAssign}
                              disabled={selectedPendingIds.size === 0 || !bulkCustomerName.trim()}
                              className="px-4 py-1.5 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                              <CheckCircle2 size={16} />
                              Gán ({selectedPendingIds.size})
                            </button>
                          </div>
                        </div>

                        {/* Bulk Date Assignment Row */}
                        <div className="flex items-center gap-4 flex-wrap border-t border-gray-200/50 pt-3">
                          <div className="flex items-center gap-2">
                            <Calendar size={14} className="text-gray-400" />
                            <span className="text-xs font-semibold text-gray-500">Đặt ngày hàng loạt cho các file đã chọn:</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={bulkChangeDate}
                              onChange={(e) => setBulkChangeDate(e.target.value)}
                              className="px-2.5 py-1 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-700 h-8"
                              disabled={selectedPendingIds.size === 0}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedPendingIds.size === 0) return;
                                try {
                                  const parsed = parse(bulkChangeDate, 'yyyy-MM-dd', new Date());
                                  const resolvedDateISO = parsed.toISOString();
                                  
                                  setPendingFiles(prev => prev.map(p => {
                                    if (selectedPendingIds.has(p.tempId)) {
                                      return { ...p, fileDate: resolvedDateISO };
                                    }
                                    return p;
                                  }));
                                  setSuccessMessage(`Đã cập nhật ngày cho ${selectedPendingIds.size} file thành công.`);
                                } catch (e) {
                                  setOperationError('Lỗi định dạng ngày.');
                                }
                              }}
                              disabled={selectedPendingIds.size === 0}
                              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 h-8 cursor-pointer"
                            >
                              Áp dụng ngày
                            </button>
                          </div>
                        </div>

                        {/* Quick Select Tags for Bulk */}
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Gán nhanh bằng thẻ tên:</p>
                          <div className="flex flex-wrap gap-2">
                            {customers.map(c => (
                              <CustomerTag 
                                key={c.id} 
                                name={c.name} 
                                onClick={async () => {
                                  if (isProcessing) return;
                                  setBulkCustomerName(c.name);
                                  // If files are selected, assign AND save immediately
                                  if (selectedPendingIds.size > 0) {
                                    // Use a temporary variable for the name to avoid state race condition
                                    const targetName = c.name;
                                    
                                    const successfulTempIds: string[] = [];
                                    const newRecords: PLTFileRecord[] = [];
                                    const addedMappings: { code: string, customerName: string }[] = [];
                                    const skippedFiles: string[] = [];

                                    setIsProcessing(true);
                                    setOperationError(null);
                                    
                                    try {
                                      for (const tempId of Array.from(selectedPendingIds)) {
                                        const pending = pendingFiles.find(p => p.tempId === (tempId as string));
                                        if (!pending || !pending.dimensions) continue;

                                        if (savingTempIdsRef.current.has(pending.tempId)) {
                                          continue;
                                        }
                                        savingTempIdsRef.current.add(pending.tempId);

                                        try {
                                          await dbService.updateMapping(pending.code, targetName);
                                          addedMappings.push({ code: pending.code, customerName: targetName });

                                          const addedFile = await dbService.addFile({
                                            fileName: pending.file.name,
                                            customerName: targetName,
                                            originalWidth: pending.dimensions.width,
                                            originalLength: pending.dimensions.length,
                                            adjustedLength: pending.dimensions.adjusted.adjustedLength,
                                            isOverWidth: pending.dimensions.adjusted.isOverWidth,
                                            fileDate: pending.fileDate
                                          });
                                          
                                          newRecords.push(addedFile);
                                          successfulTempIds.push(tempId as string);
                                        } catch (fileErr) {
                                          console.error(`Error processing bulk tag file ${pending.file.name}:`, fileErr);
                                          savingTempIdsRef.current.delete(pending.tempId);
                                        }
                                      }

                                      if (newRecords.length > 0) {
                                        setFiles(prev => [...newRecords, ...prev].sort((a, b) => 
                                          new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime()
                                        ));
                                        
                                        setSuccessMessage(`Đã gán và lưu thành công ${newRecords.length} sơ đồ.`);
                                      }

                                      setCodeMappings(prev => {
                                        const next = [...prev];
                                        addedMappings.forEach(am => {
                                          const idx = next.findIndex(m => m.code === am.code);
                                          if (idx >= 0) next[idx].customerName = am.customerName;
                                          else next.push({ code: am.code, customerName: am.customerName });
                                        });
                                        return next;
                                      });

                                      setPendingFiles(prev => prev.filter(p => !successfulTempIds.includes(p.tempId)));
                                      setSelectedPendingIds(new Set());
                                      setBulkCustomerName('');
                                    } catch (err: any) {
                                      setOperationError('Lỗi khi gán hàng loạt.');
                                    } finally {
                                      setIsProcessing(false);
                                      pendingFiles.forEach(p => savingTempIdsRef.current.delete(p.tempId));
                                    }
                                  }
                                }}
                                active={bulkCustomerName === c.name}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                    {groupedPending.length > 0 ? (
                      <div className="space-y-6 p-4 bg-gray-50/30">
                        {groupedPending.map(group => (
                          <div key={group.dateKey} className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-xs space-y-3.5">
                            {/* Date Group Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-150 pb-2.5 gap-2">
                              <div className="flex items-center gap-2">
                                <CalendarDays size={16} className="text-blue-600 animate-pulse" />
                                <span className="font-bold text-gray-800 text-sm">Ngày {group.formattedDate}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-500 font-semibold font-sans">Đổi ngày cả nhóm:</span>
                                <input
                                  type="date"
                                  value={group.dateKey}
                                  onChange={(e) => {
                                    if (!e.target.value) return;
                                    try {
                                      const newD = parse(e.target.value, 'yyyy-MM-dd', new Date());
                                      const isoStr = newD.toISOString();

                                      setPendingFiles(prev => prev.map(p => {
                                        let fileDateKey = 'Chưa rõ';
                                        try {
                                          fileDateKey = format(parseISO(p.fileDate), 'yyyy-MM-dd');
                                        } catch (e) {}
                                        if (fileDateKey === group.dateKey) {
                                          return { ...p, fileDate: isoStr };
                                        }
                                        return p;
                                      }));
                                      setSuccessMessage(`Đã chuyển ngày của nhóm sang ${format(newD, 'dd/MM/yyyy')}`);
                                    } catch(err) {}
                                  }}
                                  className="px-1.5 py-0.5 border border-dashed border-gray-300 rounded text-[10px] outline-none text-blue-700 bg-blue-50/40 font-bold cursor-pointer"
                                />
                                <span className="text-[10px] bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-bold border border-blue-100/30">
                                  {group.items.length} file
                                </span>
                              </div>
                            </div>

                            {/* Group Items */}
                            <div className="divide-y divide-gray-100 flex flex-col">
                              <AnimatePresence initial={false}>
                                {group.items.map((pending) => {
                                  const isDuplicateInDB = pending.dimensions ? files.some(f => {
                                    let fDate: Date;
                                    try {
                                      fDate = parseISO(f.fileDate);
                                    } catch {
                                      return false;
                                    }
                                    let pDate: Date;
                                    try {
                                      pDate = parseISO(pending.fileDate);
                                    } catch {
                                      pDate = new Date();
                                    }
                                    
                                    // 1. Same day
                                    const sameDay = isSameDay(pDate, fDate);
                                    if (!sameDay) return false;
                                    
                                    // 2. Same filename (case-insensitive)
                                    const sameName = f.fileName.trim().toLowerCase() === pending.file.name.trim().toLowerCase();
                                    if (!sameName) return false;
                                    
                                    // 3. Same size
                                    const sameSize = Math.abs(f.originalWidth - pending.dimensions.width) < 0.1 &&
                                                     Math.abs(f.originalLength - pending.dimensions.length) < 0.1;
                                    if (!sameSize) return false;
                                    
                                    // 4. Critical: File in DB must have a valid customer assigned that currently exists in active customer list
                                    const hasCustomer = f.customerName && f.customerName.trim();
                                    if (!hasCustomer) return false;
                                    
                                    return customers.some(c => c.name.trim().toLowerCase() === f.customerName.trim().toLowerCase());
                                  }) : false;

                                  return (
                                    <motion.div 
                                      key={pending.tempId}
                                      initial={{ opacity: 0, y: 5 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, x: 50, backgroundColor: '#f0fdf4', transition: { duration: 0.15 } }}
                                      layout
                                      className={`py-3.5 flex items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors px-2 rounded-lg ${
                                        isDuplicateInDB 
                                          ? 'border-l-4 border-red-500 bg-red-50/60 shadow-xs' 
                                          : selectedPendingIds.has(pending.tempId) 
                                            ? 'bg-blue-50/20' 
                                            : ''
                                      }`}
                                    >
                                      <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <input 
                                          type="checkbox" 
                                          checked={selectedPendingIds.has(pending.tempId)}
                                          onChange={() => toggleSelectFile(pending.tempId)}
                                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <div className="min-w-0 flex-1">
                                          <p className={`font-semibold text-xs truncate ${isDuplicateInDB ? 'text-red-900 font-bold' : 'text-gray-900'}`} title={pending.file.name}>
                                            {pending.file.name}
                                          </p>
                                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                            <span className="text-[11px] text-gray-500 font-medium">
                                              Mã: <span className="font-bold text-gray-700">{pending.code}</span>
                                            </span>
                                            {pending.dimensions?.adjusted.isOverWidth && (
                                              <span className="text-[9px] font-bold text-red-600 flex items-center gap-1 uppercase bg-red-50 px-1.5 py-0.5 rounded border border-red-150">
                                                <AlertTriangle size={9} /> Quá khổ
                                              </span>
                                            )}
                                            {isDuplicateInDB && (
                                              <span className="text-[9px] font-bold text-red-700 flex items-center gap-1 uppercase bg-red-150/80 px-1.5 py-0.5 rounded border border-red-300 animate-pulse">
                                                <AlertTriangle size={9} className="text-red-700 font-bold" /> Trùng sơ đồ đã gán khách & lưu
                                              </span>
                                            )}
                                            
                                            {/* Custom Inline Date override */}
                                            <div className="flex items-center gap-1">
                                              <span className="text-[10px] text-gray-400">Gán ngày:</span>
                                              <input
                                                type="date"
                                                value={format(parseISO(pending.fileDate), 'yyyy-MM-dd')}
                                                onChange={(e) => {
                                                  try {
                                                    const d = parse(e.target.value, 'yyyy-MM-dd', new Date());
                                                    updatePendingDateById(pending.tempId, d.toISOString());
                                                  } catch (err) {}
                                                }}
                                                className="px-1.5 py-0.5 border border-gray-250 rounded text-[10px] outline-none text-gray-600 bg-white font-semibold cursor-pointer border-dashed"
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                      
                                      <div className="flex items-center gap-2">
                                        <div className="relative animate-in fade-in" ref={activeTagPanelId === pending.tempId ? tagPanelRef : null}>
                                          <input
                                            type="text"
                                            list="customer-suggestions"
                                            value={pending.selectedCustomer}
                                            onFocus={() => setActiveTagPanelId(pending.tempId)}
                                            onChange={(e) => {
                                              const newVal = e.target.value;
                                              // Manually typing or choosing clears isAutoFilled status
                                              updatePendingCustomerById(pending.tempId, newVal, false);
                                              
                                              const exists = customers.some(c => c.name === newVal);
                                              if (exists) {
                                                setTimeout(() => handleSaveSingleFile(pending.tempId), 250);
                                              }
                                            }}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSaveSingleFile(pending.tempId)}
                                            placeholder="Gán KH..."
                                            className={`pl-2 pr-2 py-1.5 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 w-36 ${
                                              pending.isAutoFilled 
                                                ? 'border-emerald-300 bg-emerald-50/50 text-emerald-800 font-bold border-dashed'
                                                : pending.selectedCustomer 
                                                  ? 'border-blue-200 bg-blue-50 text-blue-800 font-bold' 
                                                  : 'border-gray-300 bg-white text-gray-800'
                                            }`}
                                          />

                                          {/* Floating Tag Panel */}
                                          {activeTagPanelId === pending.tempId && (
                                            <div className="absolute top-full right-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-2.5 animate-in fade-in zoom-in duration-150">
                                              <div className="flex justify-between items-center mb-1.5">
                                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Chọn nhanh khách hàng:</p>
                                                <button onClick={() => setActiveTagPanelId(null)} className="text-gray-400 hover:text-gray-650">
                                                  <X size={11} />
                                                </button>
                                              </div>
                                              <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto custom-scrollbar">
                                                {customers.map(c => (
                                                  <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => {
                                                      // Manual selection clears isAutoFilled and triggers immediate save
                                                      updatePendingCustomerById(pending.tempId, c.name, false);
                                                      setActiveTagPanelId(null);
                                                      setTimeout(() => handleSaveSingleFile(pending.tempId), 50);
                                                    }}
                                                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all border ${
                                                      pending.selectedCustomer === c.name
                                                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                                        : 'bg-gray-50 text-gray-700 border-gray-100 hover:border-blue-300 hover:bg-blue-50'
                                                    }`}
                                                  >
                                                    {c.name}
                                                  </button>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                        
                                        <div className="flex items-center gap-1 flex-shrink-0 font-sans">
                                          {pending.isAutoFilled ? (
                                            <button 
                                              type="button"
                                              onClick={() => handleSaveSingleFile(pending.tempId)}
                                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-1 cursor-pointer animate-pulse"
                                              title="Xác nhận đúng khách hàng này và Lưu sơ đồ"
                                            >
                                              <Check size={14} />
                                              Đồng ý
                                            </button>
                                          ) : (
                                            <button 
                                              type="button"
                                              onClick={() => handleSaveSingleFile(pending.tempId)}
                                              disabled={!pending.selectedCustomer.trim()}
                                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 cursor-pointer"
                                              title="Lưu file này"
                                            >
                                              <CheckCircle2 size={18} />
                                            </button>
                                          )}
                                        
                                          {pending.suggestedCustomer && pending.selectedCustomer !== pending.suggestedCustomer && (
                                            <button 
                                              type="button"
                                              onClick={() => {
                                                // Manual suggestion accept triggers immediate save and clears isAutoFilled
                                                updatePendingCustomerById(pending.tempId, pending.suggestedCustomer, false);
                                                setTimeout(() => handleSaveSingleFile(pending.tempId), 50);
                                              }}
                                              className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                                              title={`Áp dụng gợi ý và Lưu ngay: ${pending.suggestedCustomer}`}
                                            >
                                              <Info size={16} />
                                            </button>
                                          )}

                                          <button 
                                            type="button"
                                            onClick={() => {
                                              const fileIdx = pendingFiles.findIndex(p => p.tempId === pending.tempId);
                                              if (fileIdx >= 0) removePendingFile(fileIdx);
                                            }}
                                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                                            title="Xóa khỏi hàng chờ"
                                          >
                                            <Trash2 size={16} />
                                          </button>
                                        </div>
                                      </div>
                                    </motion.div>
                                  );
                                })}
                              </AnimatePresence>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-12 text-center">
                        <FolderOpen size={48} className="mx-auto text-gray-200 mb-4" />
                        <p className="text-gray-400">Chưa có file chờ phân loại. Hãy chọn file PLT ở cột bên trái.</p>
                        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-blue-500 bg-blue-50 p-3 rounded-lg max-w-sm mx-auto">
                          <Info size={14} />
                          <span>Mẹo: Hệ thống sẽ tự ghi nhớ khách hàng theo mã số file.</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* History Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white">
                <div className="flex items-center gap-4">
                  <h2 className="text-lg font-semibold">Lịch sử File đã lưu</h2>
                  <span className="text-sm text-gray-500">{historyFiles.length} file</span>
                  {selectedHistoryIds.size > 0 && (
                    <button 
                      onClick={handleBulkDeleteHistory}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-xs font-bold border border-red-100"
                    >
                      <Trash2 size={14} /> Xoá {selectedHistoryIds.size} file đã chọn
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                      <th className="px-6 py-3 w-10">
                        <input 
                          type="checkbox" 
                          checked={selectedHistoryIds.size === historyFiles.length && historyFiles.length > 0}
                          onChange={() => {
                            if (selectedHistoryIds.size === historyFiles.length && historyFiles.length > 0) {
                              setSelectedHistoryIds(new Set());
                            } else {
                              setSelectedHistoryIds(new Set(historyFiles.map(f => f.id)));
                            }
                          }}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </th>
                      <th className="px-6 py-3 font-semibold">Tên File</th>
                      <th className="px-6 py-3 font-semibold">Khách hàng</th>
                      <th className="px-6 py-3 font-semibold">Ngày File</th>
                      <th className="px-6 py-3 font-semibold text-right">Kích thước (m)</th>
                      <th className="px-6 py-3 font-semibold text-right">Tổng Dài (m)</th>
                      <th className="px-6 py-3 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historyFiles.map(file => (
                      <tr key={file.id} className={`hover:bg-gray-50/50 transition-colors ${selectedHistoryIds.has(file.id) ? 'bg-blue-50/20' : ''} ${file.isOverWidth ? 'bg-red-50/30' : ''}`}>
                        <td className="px-6 py-4">
                          <input 
                            type="checkbox" 
                            checked={selectedHistoryIds.has(file.id)}
                            onChange={() => toggleSelectHistoryFile(file.id)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-900 truncate max-w-[200px]" title={file.fileName}>
                              {file.fileName}
                            </span>
                            {file.isOverWidth && (
                              <span className="text-[10px] font-bold text-red-600 flex items-center gap-1 uppercase">
                                <AlertTriangle size={10} /> Quá khổ (1.84m)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {editingFileId === file.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                list="customer-suggestions"
                                defaultValue={file.customerName}
                                autoFocus
                                onBlur={(e) => {
                                  updateFileCustomer(file.id, e.target.value);
                                  setEditingFileId(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    updateFileCustomer(file.id, (e.target as HTMLInputElement).value);
                                    setEditingFileId(null);
                                  }
                                  if (e.key === 'Escape') setEditingFileId(null);
                                }}
                                className="px-2 py-1 border border-blue-400 rounded text-xs outline-none focus:ring-2 focus:ring-blue-500 w-32"
                              />
                            </div>
                          ) : (
                            <span 
                              onClick={() => setEditingFileId(file.id)}
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 cursor-pointer hover:bg-blue-200 transition-colors"
                              title="Nhấn để sửa tên khách hàng"
                            >
                              {file.customerName}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {format(parseISO(file.fileDate), 'dd/MM/yyyy HH:mm')}
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-mono">
                          {file.originalLength.toFixed(2)} x {file.originalWidth.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-bold text-blue-700">
                          {file.adjustedLength.toFixed(2)}m
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => {
                              setConfirmModal({
                                show: true,
                                title: 'Xoá lịch sử',
                                message: `Bạn có chắc muốn xoá file "${file.fileName}" khỏi danh sách lịch sử? Dữ liệu này vẫn sẽ tồn tại trong phần Tổng quát.`,
                                type: 'warning',
                                onConfirm: async () => {
                                  try {
                                    setConfirmModal(prev => ({ ...prev, isLoading: true }));
                                    setOperationError(null);
                                    
                                    setArchivedIds(prev => {
                                      const next = new Set(prev);
                                      next.add(file.id);
                                      return next;
                                    });

                                    setSelectedHistoryIds(prev => {
                                      const next = new Set(prev);
                                      next.delete(file.id);
                                      return next;
                                    });
                                    
                                    setSuccessMessage(`Đã ẩn file khỏi lịch sử.`);
                                  } catch (err: any) {
                                    setOperationError('Lỗi khi thực hiện.');
                                  } finally {
                                    setConfirmModal({ show: false, title: '', message: '', onConfirm: () => {} });
                                  }
                                }
                              });
                            }}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                            title="Xoá lịch sử (Không mất dữ liệu tổng)"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {historyFiles.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-gray-400 italic">
                          Chưa có dữ liệu lịch sử hoặc tất cả đã được lưu vào tổng quát.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Module 2: Summary by Customer & Date */}
        {activeTab === 'summary' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronRight size={20} className="rotate-180" />
                </button>
                <h2 className="text-lg font-bold min-w-[150px] text-center">
                  Tháng {format(currentMonth, 'MM/yyyy')}
                </h2>
                <button 
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
              <div className="flex gap-2">
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                  <Download size={16} /> Xuất Excel
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {customers.map(customer => {
                const customerFiles = files.filter(f => 
                  f.customerName && customer.name &&
                  f.customerName.trim().toLowerCase() === customer.name.trim().toLowerCase() && 
                  format(parseISO(f.fileDate), 'MM/yyyy') === format(currentMonth, 'MM/yyyy')
                );
                
                if (customerFiles.length === 0) return null;

                const totalLength = customerFiles.reduce((acc, f) => acc + f.adjustedLength, 0);
                const totalCount = customerFiles.length;
                
                // Group by day
                const dailyGroup: Record<string, { length: number, count: number, files: PLTFileRecord[] }> = {};
                customerFiles.forEach(f => {
                  const day = format(parseISO(f.fileDate), 'dd/MM');
                  if (!dailyGroup[day]) {
                    dailyGroup[day] = { length: 0, count: 0, files: [] };
                  }
                  dailyGroup[day].length += f.adjustedLength;
                  dailyGroup[day].count += 1;
                  dailyGroup[day].files.push(f);
                });

                return (
                  <div key={customer.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                    <div className="p-4 bg-blue-600 text-white">
                      <div className="flex justify-between items-start">
                        <h3 className="font-bold text-lg truncate flex-1" title={customer.name}>{customer.name}</h3>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleExportInvoice(customer.name, currentMonth, 'month')}
                            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors pointer-events-auto"
                            title="Xuất hoá đơn tháng"
                          >
                            <FileText size={16} />
                          </button>
                          <button 
                            onClick={() => {
                              setConfirmModal({
                                show: true,
                                title: 'Xác nhận xoá vĩnh viễn',
                                message: `Bạn có muốn xoá VĨNH VIỄN ${customerFiles.length} sơ đồ của khách hàng ${customer.name} trong tháng này? Thao tác này sẽ làm giảm tổng kích thước trong báo cáo.`,
                                type: 'danger',
                                onConfirm: async () => {
                                  setIsProcessing(true);
                                  setConfirmModal(prev => ({ ...prev, isLoading: true }));
                                  try {
                                    let successCount = 0;
                                    for (const f of customerFiles) {
                                      if (await dbService.deleteFile(f.id)) successCount++;
                                    }
                                    const deletedIds = new Set(customerFiles.map(f => f.id));
                                    setFiles(prev => prev.filter(f => !deletedIds.has(f.id)));
                                    setSelectedHistoryIds(prev => {
                                      const next = new Set(prev);
                                      deletedIds.forEach(id => next.delete(id));
                                      return next;
                                    });
                                    setSuccessMessage(`Đã xoá ${successCount} sơ đồ của ${customer.name} thành công.`);
                                  } catch (err) {
                                    setOperationError('Lỗi khi xoá dữ liệu hàng loạt.');
                                  } finally {
                                    setIsProcessing(false);
                                    setConfirmModal({ show: false, title: '', message: '', onConfirm: () => {} });
                                  }
                                }
                              });
                            }}
                            className="p-1.5 hover:bg-red-500 hover:text-white rounded-lg transition-colors pointer-events-auto text-blue-100"
                            title="Xoá lịch sử tháng này"
                          >
                            <Trash2 size={16} />
                          </button>
                          <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                            {totalCount} sơ đồ
                          </span>
                        </div>
                      </div>
                      <p className="text-blue-100 text-sm mt-1">Tổng in: {totalLength.toFixed(2)}m</p>
                    </div>
                    <div className="p-4 flex-1 overflow-y-auto max-h-[500px] custom-scrollbar">
                      <div className="space-y-3">
                        {Object.entries(dailyGroup).sort((a, b) => b[0].localeCompare(a[0])).map(([day, stats]) => {
                          const isExpanded = expandedCustomerDay?.customerId === customer.id && expandedCustomerDay?.day === day;
                          
                          return (
                            <div key={day} className="border-b border-gray-50 last:border-0 pb-2">
                              <div 
                                onClick={() => setExpandedCustomerDay(isExpanded ? null : { customerId: customer.id, day })}
                                className="flex justify-between items-center py-2 cursor-pointer hover:bg-gray-50 rounded px-1 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <CalendarDays size={14} className="text-gray-400" />
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium text-gray-700">{day}</span>
                                    <span className="text-[10px] text-gray-400">{stats.count} sơ đồ</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-blue-600">{stats.length.toFixed(2)}m</span>
                                  <div className="flex items-center">
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const [d, m] = day.split('/').map(Number);
                                        const refDate = new Date(currentMonth.getFullYear(), m - 1, d);
                                        handleExportInvoice(customer.name, refDate, 'day');
                                      }}
                                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                      title="Xuất hoá đơn ngày"
                                    >
                                      <FileText size={14} />
                                    </button>
                                    <ChevronRight size={14} className={`text-gray-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                  </div>
                                </div>
                              </div>
                              
                              {isExpanded && (
                                <div className="mt-2 ml-6 space-y-2 bg-gray-50 p-2 rounded-lg border border-gray-100">
                                  {stats.files.map(f => (
                                    <div key={f.id} className="flex justify-between items-center gap-2 group/file">
                                      <span className="text-[11px] text-gray-600 break-all flex-1" title={f.fileName}>{f.fileName}</span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold text-blue-700 whitespace-nowrap">{f.adjustedLength.toFixed(2)}m</span>
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setConfirmModal({
                                              show: true,
                                              title: 'Xoá vĩnh viễn',
                                              message: `Xoá file "${f.fileName}" vĩnh viễn khỏi hệ thống? Thao tác này sẽ làm thay đổi số liệu tổng quát.`,
                                              type: 'danger',
                                              onConfirm: async () => {
                                                try {
                                                  setConfirmModal(prev => ({ ...prev, isLoading: true }));
                                                  if (await dbService.deleteFile(f.id)) {
                                                    setFiles(prev => prev.filter(file => file.id !== f.id));
                                                    setSelectedHistoryIds(prev => {
                                                      const next = new Set(prev);
                                                      next.delete(f.id);
                                                      return next;
                                                    });
                                                  }
                                                } catch (err) {
                                                  setOperationError('Lỗi khi xoá vĩnh viễn.');
                                                } finally {
                                                  setConfirmModal({ show: false, title: '', message: '', onConfirm: () => {} });
                                                }
                                              }
                                            });
                                          }}
                                          className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover/file:opacity-100 transition-all"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
              {getStatsData().length === 0 && (
                <div className="col-span-full py-20 text-center bg-white rounded-xl border border-dashed border-gray-300">
                  <CalendarDays size={48} className="mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">Không có dữ liệu in ấn cho tháng này</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Module 3: Statistics & Charts */}
        {activeTab === 'stats' && (
          <div className="space-y-8">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <p className="text-sm font-medium text-gray-500 mb-1">Tổng chiều dài in</p>
                <h3 className="text-3xl font-bold text-blue-600">
                  {getStatsData().reduce((acc, s) => acc + s.totalLength, 0).toFixed(2)}m
                </h3>
                <p className="text-xs text-gray-400 mt-2">Trong tháng {format(currentMonth, 'MM/yyyy')}</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <p className="text-sm font-medium text-gray-500 mb-1">Tổng số sơ đồ</p>
                <h3 className="text-3xl font-bold text-green-600">
                  {getStatsData().reduce((acc, s) => acc + s.count, 0)}
                </h3>
                <p className="text-xs text-gray-400 mt-2">File PLT đã xử lý</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <p className="text-sm font-medium text-gray-500 mb-1">Khách hàng hoạt động</p>
                <h3 className="text-3xl font-bold text-purple-600">
                  {getStatsData().length}
                </h3>
                <p className="text-xs text-gray-400 mt-2">Trên tổng số {customers.length} khách hàng</p>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Bar Chart: Length by Customer */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold mb-6">Sản lượng theo Khách hàng (m)</h3>
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getStatsData()} layout="vertical" margin={{ left: 40, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={100} />
                      <Tooltip 
                        formatter={(value: number) => [`${value}m`, 'Tổng dài']}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="totalLength" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                        {getStatsData().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#3b82f6' : '#60a5fa'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Line Chart: Daily Trend */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold mb-6">Xu hướng in ấn hàng ngày (m)</h3>
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getDailyStats()}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip 
                        formatter={(value: number) => [`${value}m`, 'Tổng dài']}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="totalLength" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Invoice Setup Modal */}
      <AnimatePresence>
        {invoiceModal.show && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInvoiceModal(prev => ({ ...prev, show: false }))}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-gray-900">Xuất Hoá Đơn Dịch Vụ</h3>
                  <button 
                    onClick={() => setInvoiceModal(prev => ({ ...prev, show: false }))}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X size={20} className="text-gray-400" />
                  </button>
                </div>

                 <div className="space-y-6">
                  {/* Period selection tabs */}
                  <div>
                    <span className="block text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-wider">Chọn kỳ thanh toán</span>
                    <div className="flex bg-gray-100 p-1 rounded-xl">
                      {([
                        { id: 'day', label: 'Từng Ngày' },
                        { id: 'month', label: 'Cả Tháng' },
                        { id: 'year', label: 'Cả Năm' }
                      ] as const).map(tab => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setInvoiceModal(prev => ({ ...prev, periodType: tab.id }))}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                            invoiceModal.periodType === tab.id 
                              ? 'bg-white text-blue-600 shadow-sm' 
                              : 'text-gray-500 hover:text-gray-900 hover:bg-white/40'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Period Navigator inside Modal */}
                  <div className="flex items-center justify-between bg-blue-50/50 p-3 rounded-xl border border-blue-100/35">
                    <button
                      type="button"
                      onClick={() => {
                        setInvoiceModal(prev => {
                          let nextDate = prev.selectedDate;
                          if (prev.periodType === 'day') nextDate = subDays(prev.selectedDate, 1);
                          else if (prev.periodType === 'month') nextDate = subMonths(prev.selectedDate, 1);
                          else nextDate = subYears(prev.selectedDate, 1);
                          return { ...prev, selectedDate: nextDate };
                        });
                      }}
                      className="p-1.5 bg-white hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors shadow-xs"
                    >
                      <ChevronRight size={16} className="rotate-180 text-gray-650" />
                    </button>
                    
                    <div className="text-center">
                      <span className="block text-[10px] font-bold text-blue-400 uppercase tracking-widest">Thời gian xuất</span>
                      <span className="text-sm font-extrabold text-blue-900 font-mono">
                        {invoiceModal.periodType === 'day' && format(invoiceModal.selectedDate, 'dd/MM/yyyy')}
                        {invoiceModal.periodType === 'month' && format(invoiceModal.selectedDate, 'MM/yyyy')}
                        {invoiceModal.periodType === 'year' && format(invoiceModal.selectedDate, 'yyyy')}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setInvoiceModal(prev => {
                          let nextDate = prev.selectedDate;
                          if (prev.periodType === 'day') nextDate = addDays(prev.selectedDate, 1);
                          else if (prev.periodType === 'month') nextDate = addMonths(prev.selectedDate, 1);
                          else nextDate = addYears(prev.selectedDate, 1);
                          return { ...prev, selectedDate: nextDate };
                        });
                      }}
                      className="p-1.5 bg-white hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors shadow-xs"
                    >
                      <ChevronRight size={16} className="text-gray-650" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200/60">
                      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Thông tin khách hàng</h4>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-gray-500">Tên khách:</span>
                        <span className="text-sm font-extrabold text-gray-900">{invoiceModal.customerName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-500">Loại kỳ hóa đơn:</span>
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                          {invoiceModal.periodType === 'day' && 'Từng Ngày'}
                          {invoiceModal.periodType === 'month' && 'Cả Tháng'}
                          {invoiceModal.periodType === 'year' && 'Cả Năm'}
                        </span>
                      </div>
                    </div>

                    <div className={`p-4 rounded-xl border transition-colors duration-200 ${
                      invoiceFiles.length > 0 
                        ? 'bg-emerald-50/50 border-emerald-100' 
                        : 'bg-amber-50/40 border-amber-100'
                    }`}>
                      <h4 className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${
                        invoiceFiles.length > 0 ? 'text-emerald-500' : 'text-amber-500'
                      }`}>Dữ liệu in ấn</h4>
                      
                      {invoiceFiles.length > 0 ? (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>Số lượng file:</span>
                            <span className="font-extrabold text-gray-900">{invoiceFiles.length} file</span>
                          </div>
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>Tổng chiều dài:</span>
                            <span className="font-extrabold text-emerald-700">{invoiceFiles.reduce((acc, f) => acc + f.adjustedLength, 0).toFixed(2)}m</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 py-1 text-amber-700">
                          <AlertTriangle size={14} className="shrink-0" />
                          <span className="text-xs font-semibold">Thời gian này không có dữ liệu in!</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <FileText size={16} className="text-blue-500" />
                        Đơn giá in ấn (vnđ/m)
                      </h4>
                    </div>
                    <div className="relative">
                      <input 
                        type="text"
                        value={invoiceModal.unitPrice}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setInvoiceModal(prev => ({ ...prev, unitPrice: val ? parseInt(val).toLocaleString('vi-VN') : '' }));
                        }}
                        placeholder="Ví dụ: 10,000"
                        className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">vnđ</span>
                    </div>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                      <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <Save size={16} className="text-purple-500" />
                        Tiền thiết kế mẫu
                      </h4>
                      <button 
                        onClick={addDesignItem}
                        className="text-xs font-bold text-purple-600 hover:text-purple-700 bg-purple-50 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <Plus size={14} /> Thêm mẫu
                      </button>
                    </div>

                    <div className="space-y-4">
                      {invoiceModal.designItems.map((item, idx) => (
                        <div key={idx} className="bg-gray-50 rounded-xl p-4 border border-gray-200 relative group animate-in slide-in-from-top-2 duration-200">
                          <button 
                            onClick={() => removeDesignItem(idx)}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={12} />
                          </button>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-4">
                              <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Tên mẫu</label>
                                <input 
                                  type="text"
                                  value={item.name}
                                  onChange={(e) => updateDesignItem(idx, 'name', e.target.value)}
                                  placeholder="Ví dụ: Đầm xoè cổ tim"
                                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Số tiền (vnđ)</label>
                                <input 
                                  type="text"
                                  value={item.amount}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    updateDesignItem(idx, 'amount', val ? parseInt(val).toLocaleString('vi-VN') : '');
                                  }}
                                  placeholder="Ví dụ: 150,000"
                                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-purple-500"
                                />
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Ghi chú & Ảnh mẫu</label>
                                <div className="flex gap-2">
                                  <textarea 
                                    value={item.notes}
                                    onChange={(e) => updateDesignItem(idx, 'notes', e.target.value)}
                                    placeholder="Nội dung chỉnh sửa..."
                                    rows={1}
                                    className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500 resize-none h-[38px]"
                                  />
                                  <div className="relative">
                                    <input 
                                      type="file" 
                                      accept="image/*"
                                      onChange={(e) => handleDesignImageUpload(idx, e)}
                                      className="hidden"
                                      id={`image-upload-${idx}`}
                                    />
                                    <label 
                                      htmlFor={`image-upload-${idx}`}
                                      className={`w-[38px] h-[38px] flex items-center justify-center rounded-lg border cursor-pointer transition-all ${
                                        item.imageUrl ? 'bg-green-50 border-green-200 text-green-600' : 'bg-white border-gray-200 text-gray-400 hover:border-purple-400 hover:text-purple-600'
                                      }`}
                                    >
                                      {item.imageUrl ? <CheckCircle2 size={18} /> : <ImageIcon size={18} />}
                                    </label>
                                  </div>
                                </div>
                                {item.imageUrl && (
                                  <div className="mt-2 relative inline-block">
                                    <img src={item.imageUrl} alt="Sample" className="h-12 w-12 object-cover rounded border border-gray-200" />
                                    <button 
                                      onClick={() => updateDesignItem(idx, 'imageUrl', '')}
                                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"
                                    >
                                      <X size={8} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {invoiceModal.designItems.length === 0 && (
                        <p className="text-center py-4 text-xs text-gray-400 italic bg-gray-50 rounded-xl border border-dashed border-gray-200">
                          Chưa có tiền thiết kế nào được thêm.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 grid grid-cols-2 lg:grid-cols-3 gap-3 sticky bottom-0 bg-white pb-2 border-t border-gray-100">
                    <button 
                      onClick={() => setInvoiceModal(prev => ({ ...prev, show: false }))}
                      className="py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all"
                    >
                      Huỷ
                    </button>
                    <button 
                      onClick={confirmExportExcel}
                      disabled={invoiceFiles.length === 0}
                      className="py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-250 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-green-100 transition-all flex items-center justify-center gap-2"
                    >
                      <FileSpreadsheet size={18} /> Excel
                    </button>
                    <button 
                      onClick={confirmExportInvoice}
                      disabled={invoiceFiles.length === 0}
                      className="col-span-2 lg:col-span-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-250 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-2"
                    >
                      <Download size={18} /> Tải PDF
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.show && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !confirmModal.isLoading && setConfirmModal(prev => ({ ...prev, show: false }))}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-6">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
                  confirmModal.type === 'danger' ? 'bg-red-50 text-red-600' : 
                  confirmModal.type === 'warning' ? 'bg-amber-50 text-amber-600' : 
                  'bg-blue-50 text-blue-600'
                }`}>
                  {confirmModal.type === 'danger' ? <Trash2 size={24} /> : 
                   confirmModal.type === 'warning' ? <AlertTriangle size={24} /> : 
                   <Info size={24} />}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{confirmModal.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{confirmModal.message}</p>
              </div>
              <div className="p-4 bg-gray-50 flex gap-3">
                <button
                  disabled={confirmModal.isLoading}
                  onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                  className="flex-1 py-2.5 px-4 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Huỷ
                </button>
                <button
                  disabled={confirmModal.isLoading}
                  onClick={confirmModal.onConfirm}
                  className={`flex-1 py-2.5 px-4 border border-transparent text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70 ${
                    confirmModal.type === 'danger' ? 'bg-red-600 hover:bg-red-700 shadow-red-100' : 
                    confirmModal.type === 'warning' ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-100' : 
                    'bg-blue-600 hover:bg-blue-700 shadow-blue-100'
                  }`}
                >
                  {confirmModal.isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Xác nhận'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
