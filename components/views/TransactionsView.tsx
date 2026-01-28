import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { Transaction, TransactionType, Guide, Bank } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Select from '../ui/Select';
import Input from '../ui/Input';
import SearchableSelect from '../ui/SearchableSelect';
import { TrashIcon, ChevronUpCircleIcon, ChevronDownCircleIcon } from '../icons/IconComponents';
import { formatDateToDDMMYYYY } from '../../utils/formatters';
import { exportToCsv } from '../../utils/csvExport';


// Helper function to normalize various date formats into YYYY-MM-DD
const normalizePastedDate = (dateStr: string): string => {
    if (!dateStr || !dateStr.trim()) {
        console.warn("Empty date string provided, falling back to today.");
        return new Date().toISOString().split('T')[0];
    }
    const trimmedDate = dateStr.trim().toLowerCase();

    // Match DD/MM/YYYY or DD-MM-YYYY first to avoid ambiguity with new Date()
    const ddmmyyyyMatch = trimmedDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (ddmmyyyyMatch) {
        const day = ddmmyyyyMatch[1].padStart(2, '0');
        const month = ddmmyyyyMatch[2].padStart(2, '0');
        const year = ddmmyyyyMatch[3];
        const isoDateStr = `${year}-${month}-${day}`;
        const date = new Date(isoDateStr + 'T12:00:00Z');
        if (!isNaN(date.getTime()) && date.getUTCFullYear() === parseInt(year) && date.getUTCMonth() + 1 === parseInt(month) && date.getUTCDate() === parseInt(day)) {
            return isoDateStr;
        }
    }
    
    // Spanish month abbreviations
    const monthMap: { [key: string]: string } = {
        'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
        'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
    };

    // Match DD-MMM-YYYY (e.g., 1-nov-2025)
    const dmyMatch = trimmedDate.match(/^(\d{1,2})[-/\s]([a-z]{3})[-/\s](\d{4})$/);
    if (dmyMatch) {
        const day = dmyMatch[1].padStart(2, '0');
        const month = monthMap[dmyMatch[2]];
        const year = dmyMatch[3];
        if (month) {
            return `${year}-${month}-${day}`;
        }
    }

    // Fallback for ISO formats (YYYY-MM-DD)
    const date = new Date(trimmedDate);
    if (!isNaN(date.getTime())) {
        const tzCorrectedDate = new Date(date.getTime() + (date.getTimezoneOffset() * 60000));
        return tzCorrectedDate.toISOString().split('T')[0];
    }

    console.warn(`Could not parse date: "${dateStr}". Using today's date as a fallback.`);
    return new Date().toISOString().split('T')[0];
};

// Helper function to find a guide by name (flexible search)
const findGuideByName = (name: string, guides: Guide[]): string => {
    if (!name || !name.trim()) {
        return '';
    }

    const normalize = (str: string) =>
        str
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

    const searchTerm = normalize(name.trim());

    // Prioritize matches that include the search term
    const possibleMatches = guides.filter(guide => normalize(guide.name).includes(searchTerm));
    
    // If there's a perfect match (or perfect match without the number prefix), return it
    for (const match of possibleMatches) {
        // e.g. "19-nomina" === "nomina" or "19-nomina" === "19-nomina"
        if (normalize(match.name) === searchTerm || normalize(match.name.split('-').slice(1).join('-').trim()) === searchTerm) {
            return match.id;
        }
    }

    // Otherwise, return the first partial match found
    if (possibleMatches.length > 0) {
        return possibleMatches[0].id;
    }

    return '';
};

// Helper function to find a bank by name (flexible search)
const findBankByName = (name: string, banks: Bank[]): string => {
    if (!name || !name.trim()) {
        return '';
    }

    const normalize = (str: string) =>
        str
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

    const searchTerm = normalize(name.trim());

    const exactMatch = banks.find(bank => normalize(bank.name) === searchTerm);
    if (exactMatch) {
        return exactMatch.id;
    }

    const partialMatch = banks.find(bank => normalize(bank.name).includes(searchTerm));
    if (partialMatch) {
        return partialMatch.id;
    }

    return '';
};


type ParsedTransaction = Omit<Transaction, 'id'>;

const ImportDataFlow: React.FC<{ onComplete: () => void, startCsvUpload?: boolean }> = ({ onComplete, startCsvUpload = false }) => {
    const { banks, guides, addMultipleTransactions } = useAppContext();
    const [isValidationModalOpen, setValidationModalOpen] = useState(false);
    const [parsedData, setParsedData] = useState<ParsedTransaction[]>([]);
    const [selectedBank, setSelectedBank] = useState<string>('');
    const [pasteData, setPasteData] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [activeDescription, setActiveDescription] = useState<string | null>(null);
    const [showOnlyUncategorized, setShowOnlyUncategorized] = useState(false);
    const [showOnlyUnbanked, setShowOnlyUnbanked] = useState(false);
    const [isMEEnabled, setIsMEEnabled] = useState(false);
    const [isBankPreclassified, setIsBankPreclassified] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (startCsvUpload) {
            triggerFileUpload();
        }
    }, [startCsvUpload]);

    // Shared logic to process rows (whether from Paste or CSV)
    const processRawRows = (rawRows: string[][]) => {
        if (rawRows.length === 0) return;

        // 1. Analyze First Row for Headers
        const firstRow = rawRows[0].map(c => c.toLowerCase());
        
        // Keywords for detection
        const keywords = {
            date: ['fecha', 'date'],
            description: ['descrip', 'concept', 'detalle'],
            bank: ['banco', 'bank', 'cuenta'],
            guide: ['categor', 'cat', 'guia', 'rubro'],
            amountMN: ['importe mn', 'monto mn', 'mn', 'pesos', 'nacional', 'retiro', 'deposito'],
            amountME: ['importe me', 'monto me', 'me', 'usd', 'extranjer']
        };

        const findIndex = (keys: string[]) => firstRow.findIndex(cell => keys.some(k => cell.includes(k)));

        const dateIdx = findIndex(keywords.date);
        const descIdx = findIndex(keywords.description);
        let mnIdx = findIndex(keywords.amountMN);
        let meIdx = findIndex(keywords.amountME);
        
        // Fallback for generic 'importe' if specific MN not found
        if (mnIdx === -1) {
            mnIdx = firstRow.findIndex(cell => (cell.includes('importe') || cell.includes('monto')) && !cell.includes('me') && !cell.includes('usd'));
        }
        
        const catIdx = findIndex(keywords.guide);
        const bankIdx = findIndex(keywords.bank);

        // We assume it's a structured header if we find at least Date, Description and Amount
        const hasHeaders = dateIdx !== -1 && descIdx !== -1 && mnIdx !== -1;

        // 2. Determine Rows to Process
        let dataRows = rawRows;
        if (hasHeaders) {
            dataRows = rawRows.slice(1);
            // Auto-update state checkboxes for better UX feedback
            if (meIdx !== -1) setIsMEEnabled(true);
            if (bankIdx !== -1) setIsBankPreclassified(true);
        } else {
            // Existing heuristic to skip header if not fully matched but looks like one
            const commonKeywords = ['fecha', 'descrip', 'importe', 'categor', 'banco'];
            const matchCount = commonKeywords.filter(kw => firstRow.some(cell => cell.includes(kw))).length;
            if (matchCount >= 2) {
                dataRows = rawRows.slice(1);
            }
        }

        // 3. Parse Rows
        const newTransactions: ParsedTransaction[] = dataRows.map(columns => {
            let fechaRaw = '', desc = '', impMN = '0', impME = '0', categoriaRaw = '', bancoRaw = '';

            if (hasHeaders) {
                fechaRaw = dateIdx !== -1 ? columns[dateIdx] : '';
                desc = descIdx !== -1 ? columns[descIdx] : '';
                impMN = mnIdx !== -1 ? columns[mnIdx] : '0';
                impME = meIdx !== -1 ? columns[meIdx] : '0';
                categoriaRaw = catIdx !== -1 ? columns[catIdx] : '';
                bancoRaw = bankIdx !== -1 ? columns[bankIdx] : '';
            } else {
                // Fallback positional logic
                let currentIdx = 0;
                fechaRaw = columns[currentIdx++] || '';
                desc = columns[currentIdx++] || '';
                impMN = columns[currentIdx++] || '0';
                
                impME = isMEEnabled ? (columns[currentIdx++] || '0') : '0';
                categoriaRaw = columns[currentIdx++] || '';
                bancoRaw = isBankPreclassified ? (columns[currentIdx++] || '') : '';
            }

            // Normalization
            const fecha = normalizePastedDate(fechaRaw);
            
            const cleanAmount = (val: string) => {
                if (!val) return 0;
                // remove quotes if any remain, standard logic
                const clean = val.replace(/[$,]/g, '').trim();
                const floatVal = parseFloat(clean);
                return isNaN(floatVal) ? 0 : floatVal;
            };

            const amountMN = cleanAmount(impMN);
            const amountME = cleanAmount(impME);
            const guideId = findGuideByName(categoriaRaw, guides);
            const bankId = ((hasHeaders && bankIdx !== -1) || isBankPreclassified) ? findBankByName(bancoRaw, banks) : '';

            return {
                bank: bankId,
                guide: guideId, 
                date: fecha,
                month: fecha.substring(0, 7),
                description: desc,
                amountMN: amountMN,
                amountME: amountME,
                type: (amountMN >= 0) ? TransactionType.Income : TransactionType.Expense,
                assigned: '',
            };
        }).filter(t => t.description && (t.amountMN !== 0 || t.amountME !== 0));

        if (newTransactions.length > 0) {
            setParsedData(newTransactions);
            if (!newTransactions.some(t => t.bank) && banks.length > 0) {
                 setSelectedBank(banks[0].id);
            }
            setValidationModalOpen(true);
        } else {
             alert("No se pudieron encontrar datos válidos. Revise el formato del archivo o del texto pegado.");
        }
    }

    const handlePasteParse = async () => {
        const rawRows = pasteData.trim().split('\n').map(row => row.split('\t'));
        processRawRows(rawRows);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target?.result as string;
            if (text) {
                // Parse CSV logic
                const rows: string[][] = [];
                let currentRow: string[] = [];
                let currentCell = '';
                let inQuotes = false;

                for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    const nextChar = text[i + 1];

                    if (inQuotes) {
                        if (char === '"' && nextChar === '"') {
                            currentCell += '"';
                            i++; // Skip next quote
                        } else if (char === '"') {
                            inQuotes = false;
                        } else {
                            currentCell += char;
                        }
                    } else {
                        if (char === '"') {
                            inQuotes = true;
                        } else if (char === ',') {
                            currentRow.push(currentCell);
                            currentCell = '';
                        } else if (char === '\n' || char === '\r') {
                            // Handle CRLF
                            if (char === '\r' && nextChar === '\n') {
                                i++;
                            }
                            currentRow.push(currentCell);
                            rows.push(currentRow);
                            currentRow = [];
                            currentCell = '';
                        } else {
                            currentCell += char;
                        }
                    }
                }
                // Push last cell/row
                if (currentCell || currentRow.length > 0) {
                    currentRow.push(currentCell);
                    rows.push(currentRow);
                }

                // Filter empty rows
                const cleanRows = rows.filter(r => r.length > 0 && (r.length > 1 || r[0].trim() !== ''));
                processRawRows(cleanRows);
            }
        };
        reader.readAsText(file);
        // Reset input value so same file can be selected again if needed
        e.target.value = '';
    };

    const triggerFileUpload = () => {
        fileInputRef.current?.click();
    };


    const handleGuideChange = (index: number, guideId: string) => {
        setParsedData(prev => {
            const updated = [...prev];
            if (updated[index]) {
                updated[index].guide = guideId;
            }
            return updated;
        });
    };

    const handleBankChange = (index: number, bankId: string) => {
        setParsedData(prev => {
            const updated = [...prev];
            if(updated[index]) {
                updated[index].bank = bankId;
            }
            return updated;
        })
    }
    
    const handleCloseValidationModal = () => {
        setValidationModalOpen(false);
        setActiveDescription(null);
        setParsedData([]);
        setPasteData('');
        setShowOnlyUncategorized(false);
        setShowOnlyUnbanked(false);
    };

    const confirmImport = () => {
        if (!isBankPreclassified && !selectedBank && parsedData.some(t => !t.bank)) {
            // If not preclassified and no global bank selected (and some transactions lack bank), warn
             if (!selectedBank) {
                 alert('Por favor, seleccione un banco o asegúrese que todas las transacciones tengan uno asignado.');
                 return;
             }
        }

        const unbankedCount = parsedData.filter(t => !t.bank && !selectedBank).length;
         if (unbankedCount > 0) {
             // This case happens if preclassified is on but some rows missed bank
            alert(`Por favor, asigne un banco a las ${unbankedCount} transacciones restantes.`);
            setShowOnlyUnbanked(true);
            return;
        }

        const uncategorizedCount = parsedData.filter(t => !t.guide).length;
        if (uncategorizedCount > 0) {
            alert(`Por favor, asigne una categoría a las ${uncategorizedCount} transacciones restantes.`);
            setShowOnlyUncategorized(true);
            return;
        }
        
        setIsImporting(true);

        const transactionsToImport: Omit<Transaction, 'id'>[] = parsedData.map(t => ({
            ...t,
            bank: t.bank || selectedBank,
        }));
        
        addMultipleTransactions(transactionsToImport);
        
        setIsImporting(false);
        handleCloseValidationModal();
        onComplete();
    };
    
    const dataToRender = useMemo(() => {
        return parsedData
            .map((t, index) => ({ ...t, originalIndex: index }))
            .filter(t => {
                const isUncategorized = !t.guide;
                const isUnbanked = !t.bank;

                const hasCategoryFilter = showOnlyUncategorized && isUncategorized;
                const hasBankFilter = (isBankPreclassified || !selectedBank) && showOnlyUnbanked && isUnbanked;

                if (showOnlyUncategorized && showOnlyUnbanked) {
                    return hasCategoryFilter || hasBankFilter;
                }
                if (showOnlyUncategorized) {
                    return hasCategoryFilter;
                }
                if (showOnlyUnbanked) {
                    return hasBankFilter;
                }
                return true;
            });
    }, [parsedData, showOnlyUncategorized, showOnlyUnbanked, isBankPreclassified, selectedBank]);

    const placeholderText = `Pegue aquí los datos desde Excel.
    
Si incluye encabezados (Fecha, Descripción, Importe...), el orden de las columnas se detectará automáticamente.

Si NO incluye encabezados, use este orden:
Fecha | Descripción | Importe MN | [Importe ME] | [Categoría] | [Banco]`;
    
    const instructionColumns = `<strong>Fecha, Descripción, Importe MN</strong>${isMEEnabled ? ', Importe ME' : ''}. Las columnas <strong>Categoría</strong>${isBankPreclassified ? ' y <strong>Banco</strong>' : ''} son opcionales y van al final.`;


    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h4 className="font-medium mb-2">Pegar desde Excel</h4>
                     <div className="flex flex-col sm:flex-row sm:space-x-6 mb-2">
                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                id="me-toggle"
                                checked={isMEEnabled}
                                onChange={(e) => setIsMEEnabled(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label htmlFor="me-toggle" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                Habilitar moneda extranjera (ME)
                            </label>
                        </div>
                         <div className="flex items-center">
                            <input
                                type="checkbox"
                                id="bank-toggle"
                                checked={isBankPreclassified}
                                onChange={(e) => setIsBankPreclassified(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label htmlFor="bank-toggle" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                Banco ya clasificado
                            </label>
                        </div>
                    </div>
                    <textarea 
                        className="w-full h-32 p-2 border rounded-md dark:bg-gray-800 dark:border-gray-600 text-xs font-mono"
                        placeholder={placeholderText}
                        value={pasteData}
                        onChange={(e) => setPasteData(e.target.value)}
                    />
                    <div className="flex space-x-2 mt-2">
                        <Button onClick={handlePasteParse} disabled={!pasteData} size="sm">
                            Validar Datos Pegados
                        </Button>
                    </div>

                    {/* Hidden file input for dedicated CSV upload button to trigger */}
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        accept=".csv" 
                        className="hidden" 
                    />
                </div>
                 <div>
                    <h4 className="font-medium mb-2">Instrucciones</h4>
                    <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                        <p>Copie las columnas y péguelas en el cuadro de texto.</p>
                        <hr className="dark:border-gray-600"/>
                        <p className="font-medium text-primary-700 dark:text-primary-400">
                           Detección Automática:
                        </p>
                        <p>El sistema busca encabezados como "Fecha", "Descripción", "Importe", "Categoría" y "Banco".</p>
                        <p>Si <strong>NO</strong> tiene encabezados, use este orden:</p>
                         <p><span dangerouslySetInnerHTML={{ __html: instructionColumns }} /></p>
                    </div>
                </div>
            </div>

            <Modal isOpen={isValidationModalOpen} onClose={handleCloseValidationModal} title="Validar y Categorizar Transacciones" maxWidth="7xl" footer={
                <div className="space-x-2">
                    <Button variant="secondary" onClick={handleCloseValidationModal} disabled={isImporting}>Cancelar</Button>
                    <Button onClick={confirmImport} disabled={isImporting}>
                        {isImporting ? 'Importando...' : `Importar ${parsedData.length} Transacciones`}
                    </Button>
                </div>
            }>
                <div>
                    {!isBankPreclassified && (
                        <Select 
                            label="Seleccionar Banco para transacciones sin banco asignado"
                            value={selectedBank}
                            onChange={e => setSelectedBank(e.target.value)}
                            className="mb-4 max-w-sm"
                        >
                            {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </Select>
                    )}
                    
                     <div className="sticky top-0 bg-white dark:bg-gray-800 z-10 py-4">
                        <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-md border dark:border-gray-700 min-h-[70px] flex flex-col justify-center">
                           <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Descripción de la transacción seleccionada:</p>
                           <p className="text-sm text-gray-800 dark:text-gray-200">
                             {activeDescription || <span className="italic text-gray-400">Haga clic en un campo de categoría/banco para ver la descripción aquí.</span>}
                           </p>
                        </div>
                    </div>

                    <div className="flex items-center my-4 space-x-4">
                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                id="filter-uncategorized"
                                checked={showOnlyUncategorized}
                                onChange={(e) => setShowOnlyUncategorized(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label htmlFor="filter-uncategorized" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                Mostrar solo transacciones sin categoría
                            </label>
                        </div>
                        {isBankPreclassified && (
                           <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="filter-unbanked"
                                    checked={showOnlyUnbanked}
                                    onChange={(e) => setShowOnlyUnbanked(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                                />
                                <label htmlFor="filter-unbanked" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Mostrar solo transacciones sin banco
                                </label>
                            </div>
                        )}
                    </div>

                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100 dark:bg-gray-700">
                            <tr>
                                <th className="p-2 w-[10%]">Fecha</th>
                                <th className="p-2" style={{width: isBankPreclassified ? '25%' : '40%'}}>Descripción</th>
                                {isBankPreclassified && <th className="p-2 w-[20%]">Banco</th>}
                                <th className="p-2 w-[10%] text-right">Importe MN</th>
                                <th className="p-2 w-[10%] text-right">Importe ME</th>
                                <th className="p-2" style={{width: isBankPreclassified ? '25%' : '26%'}}>Categoría</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dataToRender.map((t) => (
                                <tr key={t.originalIndex} className="border-b dark:border-gray-700">
                                    <td className="p-2 whitespace-nowrap">{formatDateToDDMMYYYY(t.date)}</td>
                                    <td className="p-2 max-w-sm truncate" title={t.description}>{t.description}</td>
                                    {isBankPreclassified && (
                                        <td className="p-1">
                                            <SearchableSelect
                                                value={t.bank}
                                                onChange={(newValue) => handleBankChange(t.originalIndex, newValue)}
                                                options={banks.map(b => ({ value: b.id, label: b.name }))}
                                                placeholder="Asignar banco..."
                                                className="w-full"
                                                onFocus={() => setActiveDescription(t.description)}
                                            />
                                        </td>
                                    )}
                                    <td className={`p-2 text-right whitespace-nowrap font-mono ${t.amountMN < 0 ? 'text-red-500' : 'text-green-500'}`}>{t.amountMN.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</td>
                                    <td className={`p-2 text-right whitespace-nowrap font-mono ${t.amountME < 0 ? 'text-red-500' : 'text-green-500'}`}>{t.amountME.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                                    <td className="p-1">
                                         <SearchableSelect
                                            value={t.guide}
                                            onChange={(newValue) => handleGuideChange(t.originalIndex, newValue)}
                                            options={guides.map(g => ({ value: g.id, label: g.name }))}
                                            placeholder="Buscar categoría..."
                                            className="w-full"
                                            onFocus={() => setActiveDescription(t.description)}
                                        />
                                    </td>
                                </tr>
                            ))}
                             {dataToRender.length === 0 && (
                                <tr>
                                    <td colSpan={isBankPreclassified ? 6: 5} className="text-center py-4 text-gray-500">
                                        {(showOnlyUncategorized || (showOnlyUnbanked && isBankPreclassified)) ? "Todas las transacciones visibles tienen la información requerida." : "No hay transacciones para mostrar."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Modal>
        </div>
    );
};


interface TransactionsTableProps {
    transactionsToDisplay: Transaction[];
    getBankName: (id: string) => string;
    getGuideName: (id: string) => string;
    onDeleteOne: (id: string) => void;
    isBankEditingEnabled: boolean;
    onBankChange: (id: string, newBankId: string) => void;
    banks: Bank[];
}

const TransactionsTable: React.FC<TransactionsTableProps> = ({
    transactionsToDisplay,
    getBankName,
    getGuideName,
    onDeleteOne,
    isBankEditingEnabled,
    onBankChange,
    banks,
}) => {
    const sortedTransactions = useMemo(() => {
        return [...transactionsToDisplay].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactionsToDisplay]);

    return (
        <Card>
            <h3 className="text-lg font-semibold mb-4">Historial de Transacciones ({sortedTransactions.length})</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                        <tr>
                            <th scope="col" className="px-6 py-3">#</th>
                            <th scope="col" className="px-6 py-3">Fecha</th>
                            <th scope="col" className="px-6 py-3">Banco</th>
                            <th scope="col" className="px-6 py-3">Descripción</th>
                            <th scope="col" className="px-6 py-3">Categoría</th>
                            <th scope="col" className="px-6 py-3 text-right">Importe MN</th>
                            <th scope="col" className="px-6 py-3 text-right">Importe ME</th>
                            <th scope="col" className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedTransactions.length > 0 ? sortedTransactions.map((t, index) => (
                            <tr key={t.id} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                                <td className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">{sortedTransactions.length - index}</td>
                                <td className="px-6 py-4">{formatDateToDDMMYYYY(t.date)}</td>
                                <td className="px-6 py-2">
                                    {isBankEditingEnabled ? (
                                        <SearchableSelect
                                            value={t.bank}
                                            onChange={(newBankId) => onBankChange(t.id, newBankId)}
                                            options={banks.map(b => ({ value: b.id, label: b.name }))}
                                            placeholder="Cambiar banco..."
                                            className="min-w-[150px]"
                                        />
                                    ) : (
                                        getBankName(t.bank)
                                    )}
                                </td>
                                <td className="px-6 py-4 max-w-xs truncate" title={t.description}>{t.description}</td>
                                <td className="px-6 py-4">{getGuideName(t.guide)}</td>
                                <td className={`px-6 py-4 text-right font-mono ${t.type === TransactionType.Expense ? 'text-red-500' : 'text-green-500'}`}>
                                    {t.amountMN.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                                </td>
                                <td className={`px-6 py-4 text-right font-mono ${t.amountME < 0 ? 'text-red-500' : 'text-green-500'}`}>
                                    {t.amountME !== 0 ? t.amountME.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : ''}
                                </td>
                                <td className="px-6 py-4">
                                    <button onClick={() => onDeleteOne(t.id)} className="text-gray-500 hover:text-red-600">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={8} className="text-center py-8 text-gray-500">No hay transacciones que coincidan con los filtros.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

const initialFilters = {
    startDate: '',
    endDate: '',
    bankId: '',
    guideId: '',
    description: '',
};

const TransactionsView: React.FC = () => {
    const { 
        transactions, 
        banks, 
        guides, 
        deleteTransaction,
        updateTransaction, 
        persistenceEnabled, 
        setPersistenceEnabled, 
        clearHistory 
    } = useAppContext();
    
    const [isImportModalOpen, setImportModalOpen] = useState(false);
    const [startCsvUpload, setStartCsvUpload] = useState(false);
    const [filters, setFilters] = useState(initialFilters);
    const [isBankEditingEnabled, setIsBankEditingEnabled] = useState(false);
    const [scrollPosition, setScrollPosition] = useState<'top' | 'middle' | 'bottom'>('top');
    const mainScrollRef = useRef<HTMLElement | null>(null);

     useEffect(() => {
        const mainEl = document.querySelector('main');
        if (mainEl) {
            mainScrollRef.current = mainEl;

            const handleScroll = () => {
                const { scrollTop, scrollHeight, clientHeight } = mainEl;
                const isAtBottom = scrollHeight - scrollTop - clientHeight < 1;

                if (scrollTop === 0) {
                    setScrollPosition('top');
                } else if (isAtBottom) {
                    setScrollPosition('bottom');
                } else {
                    setScrollPosition('middle');
                }
            };

            handleScroll(); // Initial check
            mainEl.addEventListener('scroll', handleScroll);

            return () => {
                mainEl.removeEventListener('scroll', handleScroll);
            };
        }
    }, []);

    const scrollToTop = () => {
        mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const scrollToBottom = () => {
        if (mainScrollRef.current) {
            mainScrollRef.current.scrollTo({ top: mainScrollRef.current.scrollHeight, behavior: 'smooth' });
        }
    };
    
    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            if (filters.startDate && t.date < filters.startDate) return false;
            if (filters.endDate && t.date > filters.endDate) return false;
            if (filters.bankId && t.bank !== filters.bankId) return false;
            if (filters.guideId && t.guide !== filters.guideId) return false;
            if (filters.description && !t.description.toLowerCase().includes(filters.description.toLowerCase())) return false;
            return true;
        });
    }, [transactions, filters]);

    const selectedBankBalances = useMemo(() => {
        if (!filters.bankId) {
            return null;
        }
        const selectedBank = banks.find(b => b.id === filters.bankId);
        if (!selectedBank) {
            return null;
        }
    
        const isForeignCurrencyAccount = /USD|EURO/i.test(selectedBank.name);
        const currencyType = selectedBank.name.includes('USD') ? 'USD' : selectedBank.name.includes('EURO') ? 'EUR' : 'MXN';
    
        const relevantTransactions = transactions.filter(t => t.bank === filters.bankId);
        
        const balanceMN = relevantTransactions.reduce((sum, t) => sum + t.amountMN, 0);
        const balanceME = relevantTransactions.reduce((sum, t) => sum + t.amountME, 0);
    
        return { balanceMN, balanceME, isForeignCurrencyAccount, currencyType };
    }, [transactions, filters.bankId, banks]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };
    
    const handleGuideFilterChange = (guideId: string) => {
        setFilters(prev => ({...prev, guideId}));
    }

    const clearFilters = () => setFilters(initialFilters);

    const getBankName = useCallback((id: string) => banks.find(b => b.id === id)?.name || 'N/A', [banks]);
    const getGuideName = useCallback((id: string) => guides.find(g => g.id === id)?.name || 'N/A', [guides]);

    const handleBankChange = (transactionId: string, newBankId: string) => {
        updateTransaction(transactionId, { bank: newBankId });
    };

    const handleClearHistory = () => {
        if (window.confirm('¿Está seguro de que desea borrar TODO el historial (transacciones y pagos programados)? Esta acción no se puede deshacer.')) {
            clearHistory();
        }
    };

    const handleExport = () => {
        const headers = ['Fecha', 'Banco', 'Descripción', 'Categoría', 'Importe MN', 'Importe ME'];

        const sortedTransactions = [...filteredTransactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const rows = sortedTransactions.map(t => [
            formatDateToDDMMYYYY(t.date),
            getBankName(t.bank),
            t.description,
            getGuideName(t.guide),
            t.amountMN,
            t.amountME
        ]);

        exportToCsv(`historial_transacciones_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    };

    const handleImportCsvClick = () => {
        setStartCsvUpload(true);
        setImportModalOpen(true);
    };

    return (
        <div className="space-y-6">
            <Card>
                <div className="flex flex-wrap justify-between items-center gap-4">
                     <div className="flex items-center space-x-3">
                        <input
                            type="checkbox"
                            id="persistence-toggle"
                            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                            checked={persistenceEnabled}
                            onChange={(e) => setPersistenceEnabled(e.target.checked)}
                        />
                        <label htmlFor="persistence-toggle" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Habilitar guardado de transacciones
                        </label>
                    </div>
                    
                    <Button variant="secondary" onClick={handleImportCsvClick}>Importar Archivo .csv</Button>

                    <div className="flex items-center gap-4">
                        <Button variant="danger" size="md" onClick={handleClearHistory}>
                            Borrar Todo el Historial
                        </Button>
                        <Button onClick={() => setImportModalOpen(true)}>Pegar</Button>
                    </div>
                </div>
            </Card>

            <Card>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-end">
                    <Input label="Desde" type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
                    <Input label="Hasta" type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
                    <Select label="Banco" name="bankId" value={filters.bankId} onChange={handleFilterChange}>
                        <option value="">Todos los bancos</option>
                        {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                     <div className="flex flex-col">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoría</label>
                         <SearchableSelect
                            value={filters.guideId}
                            onChange={handleGuideFilterChange}
                            options={guides.map(g => ({ value: g.id, label: g.name }))}
                            placeholder="Todas las categorías"
                        />
                     </div>
                    <Input label="Descripción" name="description" value={filters.description} onChange={handleFilterChange} placeholder="Buscar por texto..."/>
                </div>
                <div className="flex flex-wrap justify-between items-center mt-4 gap-4">
                    <div className="flex items-center gap-4">
                        <Button variant="secondary" onClick={clearFilters}>Limpiar Filtros</Button>
                        <div className="flex items-center space-x-2 border-l pl-4 dark:border-gray-600">
                             <input
                                type="checkbox"
                                id="bank-edit-toggle"
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                                checked={isBankEditingEnabled}
                                onChange={(e) => setIsBankEditingEnabled(e.target.checked)}
                            />
                            <label htmlFor="bank-edit-toggle" className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                Habilitar cambio de banco
                            </label>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {selectedBankBalances && (
                            <div className="text-right">
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Saldo de la Cuenta</p>
                                {selectedBankBalances.isForeignCurrencyAccount ? (
                                    <>
                                        <p className={`text-lg font-bold ${selectedBankBalances.balanceME >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            {selectedBankBalances.balanceME.toLocaleString(
                                                selectedBankBalances.currencyType === 'EUR' ? 'de-DE' : 'en-US', 
                                                { style: 'currency', currency: selectedBankBalances.currencyType }
                                            )}
                                        </p>
                                        <p className={`text-sm font-medium ${selectedBankBalances.balanceMN >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            ({selectedBankBalances.balanceMN.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })})
                                        </p>
                                    </>
                                ) : (
                                    <p className={`text-lg font-bold ${selectedBankBalances.balanceMN >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {selectedBankBalances.balanceMN.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                                    </p>
                                )}
                            </div>
                        )}
                        <Button onClick={handleExport} disabled={filteredTransactions.length === 0}>
                            Exportar a CSV
                        </Button>
                    </div>
                </div>
            </Card>
            
            <Modal
              isOpen={isImportModalOpen}
              onClose={() => {
                setImportModalOpen(false);
                setStartCsvUpload(false);
              }}
              title="Importar Datos"
              maxWidth="4xl"
            >
              <ImportDataFlow onComplete={() => {
                setImportModalOpen(false);
                setStartCsvUpload(false);
              }} startCsvUpload={startCsvUpload} />
            </Modal>

            <TransactionsTable 
                transactionsToDisplay={filteredTransactions}
                getBankName={getBankName}
                getGuideName={getGuideName}
                onDeleteOne={deleteTransaction}
                isBankEditingEnabled={isBankEditingEnabled}
                onBankChange={handleBankChange}
                banks={banks}
            />

            {/* Smart Scrolling Buttons */}
            <div className="fixed bottom-6 right-6 flex flex-col space-y-2 z-40">
                {(scrollPosition === 'middle' || scrollPosition === 'bottom') && (
                    <button
                        onClick={scrollToTop}
                        className="p-2 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 transition-transform transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                        aria-label="Scroll to top"
                        title="Ir hasta arriba"
                    >
                        <ChevronUpCircleIcon className="w-8 h-8" />
                    </button>
                )}
                {(scrollPosition === 'middle' || scrollPosition === 'top') && (
                    <button
                        onClick={scrollToBottom}
                        className="p-2 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 transition-transform transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                        aria-label="Scroll to bottom"
                        title="Ir hasta abajo"
                    >
                        <ChevronDownCircleIcon className="w-8 h-8" />
                    </button>
                )}
            </div>
        </div>
    );
};

export default TransactionsView;