import React, { useState, useMemo, useCallback } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { ScheduledPayment, Guide } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { TrashIcon } from '../icons/IconComponents';
import { formatDateToDDMMYYYY } from '../../utils/formatters';
import SearchableSelect from '../ui/SearchableSelect';

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


const ImportScheduledPaymentsFlow: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
    const { addMultipleScheduledPayments, guides } = useAppContext();
    const [step, setStep] = useState<'input' | 'validation'>('input');
    const [parsedData, setParsedData] = useState<Omit<ScheduledPayment, 'id'>[]>([]);
    const [pasteData, setPasteData] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [activeConcept, setActiveConcept] = useState<string | null>(null);

    const handlePasteParse = () => {
        const rawRows = pasteData.trim().split('\n');
        if (rawRows.length === 0) return;

        const firstRow = rawRows[0].toLowerCase();
        const headerCells = firstRow.split('\t').map(c => c.trim());

        // Keywords detection
        const keywords = {
            responsible: ['resp', 'solicitante', 'encargado'],
            supplier: ['proveedor', 'beneficiario'],
            concept: ['concepto', 'detalle', 'descrip'],
            amountME: ['m.e.', 'me', 'usd', 'dolar'],
            exchangeRate: ['tc', 't.c.', 'cambio'],
            amountMN: ['importe', 'monto', 'mn', 'pesos'],
            date: ['fecha', 'date'],
            guide: ['categor', 'guia', 'rubro']
        };

        const findIndex = (keys: string[]) => headerCells.findIndex(cell => keys.some(k => cell.includes(k)));

        const respIdx = findIndex(keywords.responsible);
        const supIdx = findIndex(keywords.supplier);
        const conIdx = findIndex(keywords.concept);
        const meIdx = findIndex(keywords.amountME);
        const tcIdx = findIndex(keywords.exchangeRate);
        let mnIdx = findIndex(keywords.amountMN);

        // If "Importe ME" matched as MN because of "Importe", disambiguate
        if (mnIdx === meIdx && mnIdx !== -1) {
             mnIdx = headerCells.findIndex(cell => cell.includes('mn') || (cell.includes('importe') && !cell.includes('me') && !cell.includes('usd')));
        }

        const dateIdx = findIndex(keywords.date);
        const catIdx = findIndex(keywords.guide);

        // We consider it "Headered" if we found at least Concept, Date and one Amount field
        const hasHeaders = conIdx !== -1 && dateIdx !== -1 && (mnIdx !== -1 || meIdx !== -1);

        let dataRows = rawRows;
        if (hasHeaders) {
            dataRows = rawRows.slice(1);
        } else {
            // Fallback heuristic: skip first row if it looks like headers based on keywords presence
            if (firstRow.includes('concepto') || firstRow.includes('importe') || firstRow.includes('resp')) {
                dataRows = rawRows.slice(1);
            }
        }

        const cleanAmount = (val: string) => {
            if (!val) return 0;
            // Handle accounting format (parenthesis for negative)
            const isNegative = (val.includes('(') && val.includes(')')) || val.trim().startsWith('-');
            const clean = val.replace(/[$,() ]/g, '').trim();
            const floatVal = parseFloat(clean);
            const result = isNaN(floatVal) ? 0 : floatVal;
            // If clean string already had minus, parseFloat handles it. 
            // But if it was parenthesis format, we need to negate manually.
            if (val.includes('(') && val.includes(')') && result > 0) {
                return -result;
            }
            return result;
        };

        const newPayments = dataRows.map(row => {
            const columns = row.split('\t');
            let resp='', prov='', conc='', meStr='0', tcStr='0', mnStr='0', dateStr='', catStr='';

            if (hasHeaders) {
                resp = respIdx !== -1 ? columns[respIdx] : '';
                prov = supIdx !== -1 ? columns[supIdx] : '';
                conc = conIdx !== -1 ? columns[conIdx] : '';
                meStr = meIdx !== -1 ? columns[meIdx] : '0';
                tcStr = tcIdx !== -1 ? columns[tcIdx] : '0';
                mnStr = mnIdx !== -1 ? columns[mnIdx] : '0';
                dateStr = dateIdx !== -1 ? columns[dateIdx] : '';
                catStr = catIdx !== -1 ? columns[catIdx] : '';
            } else {
                // Fallback logic if no headers are found
                const datePattern = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/;
                const dateIdxFallback = columns.findIndex(c => datePattern.test(c));
                
                if (dateIdxFallback === 4) {
                     resp = columns[0];
                     prov = columns[1];
                     conc = columns[2];
                     mnStr = columns[3]; 
                     dateStr = columns[4];
                     catStr = columns[5] || '';
                } else if (dateIdxFallback === 6) {
                     resp = columns[0];
                     prov = columns[1];
                     conc = columns[2];
                     meStr = columns[3];
                     tcStr = columns[4];
                     mnStr = columns[5];
                     dateStr = columns[6];
                     catStr = columns[7] || '';
                } else {
                    resp = columns[0] || '';
                    prov = columns[1] || '';
                    conc = columns[2] || '';
                    meStr = columns[3] || '0';
                    tcStr = columns[4] || '0';
                    mnStr = columns[5] || '0';
                    dateStr = columns[6] || '';
                    catStr = columns[7] || '';
                }
            }

            if (!conc && !mnStr && !meStr && !resp) return null;

            const amountME = cleanAmount(meStr);
            const exchangeRate = cleanAmount(tcStr);
            const amountMN = cleanAmount(mnStr);
            
            let finalAmount = 0;
            if (amountMN !== 0) {
                finalAmount = amountMN; 
            } else if (amountME !== 0 && exchangeRate !== 0) {
                finalAmount = amountME * exchangeRate;
            }

            // Relaxed filter: Allow if concept is missing (will fill default) 
            // or if amounts are 0 but row has content.
            return {
                responsible: resp,
                supplier: prov,
                concept: conc || 'Sin Concepto',
                amountME: amountME,
                exchangeRate: exchangeRate,
                amount: finalAmount,
                date: normalizePastedDate(dateStr),
                guide: findGuideByName(catStr, guides),
            };
        }).filter(p => p !== null) as Omit<ScheduledPayment, 'id'>[];
        
        // Only keep payments that have at least some money involved or valid data
        const validPayments = newPayments.filter(p => Math.abs(p.amount) > 0 || Math.abs(p.amountME) > 0);

        if (validPayments.length > 0) {
            setParsedData(validPayments);
            setStep('validation');
        } else if (pasteData.trim()) {
            alert("No se pudieron encontrar datos válidos. Asegúrese de que las columnas de importe tengan valores numéricos.");
        }
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

    const handleDeleteRow = (index: number) => {
        setParsedData(prev => prev.filter((_, i) => i !== index));
    };

    const confirmImport = () => {
        const uncategorizedCount = parsedData.filter(p => !p.guide).length;
        if (uncategorizedCount > 0) {
            if(!window.confirm(`Hay ${uncategorizedCount} pagos sin categoría. ¿Desea importarlos de todos modos?`)) {
                return;
            }
        }

        setIsImporting(true);
        addMultipleScheduledPayments(parsedData);
        setIsImporting(false);
        onComplete();
    };
    
    const handleCancel = () => {
        setStep('input');
        setParsedData([]);
        setPasteData('');
        setActiveConcept(null);
    };

    const placeholderText = `Pegue aquí los datos desde Excel.
    
Si incluye encabezados (Resp, Concepto, Importe...), el orden se detecta automáticamente.

Si NO incluye encabezados, use:
Resp | Proveedor | Concepto | Importe MN | Fecha | [Categoria]
(o formato completo con ME y TC)`;

    if (step === 'input') {
        return (
            <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h4 className="font-medium mb-2">Pegar desde Excel</h4>
                        <textarea 
                            className="w-full h-32 p-2 border rounded-md dark:bg-gray-800 dark:border-gray-600 text-xs font-mono"
                            placeholder={placeholderText}
                            value={pasteData}
                            onChange={(e) => setPasteData(e.target.value)}
                        />
                        <Button onClick={handlePasteParse} className="mt-2" disabled={!pasteData}>
                            Validar Datos Pegados
                        </Button>
                    </div>
                    <div>
                        <h4 className="font-medium mb-2">Instrucciones</h4>
                        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                             <p>1. Copie las columnas de su archivo de Excel/Sheets.</p>
                             <p className="font-medium text-primary-700 dark:text-primary-400">
                               ¡Nuevo! Si sus datos tienen encabezados, el sistema detectará el orden automáticamente.
                            </p>
                            <p>2. Si <strong>NO</strong> tiene encabezados, asegúrese que el orden sea:</p>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>Formato Simple: <strong>Resp, Prov, Concepto, Importe, Fecha, Categoria</strong>.</li>
                                <li>Formato Completo: <strong>Resp, Prov, Concepto, ME, TC, Importe, Fecha, Categoria</strong>.</li>
                            </ul>
                            <p>3. Haga clic en "Validar Datos Pegados".</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
             <div className="sticky top-0 bg-white dark:bg-gray-800 z-10 py-4">
                <div className="flex justify-between items-center mb-2">
                    <h4 className="text-lg font-semibold">Validar Datos ({parsedData.length} pagos)</h4>
                    <div className="space-x-2">
                        <Button variant="secondary" onClick={handleCancel} disabled={isImporting}>Cancelar / Volver</Button>
                        <Button onClick={confirmImport} disabled={isImporting || parsedData.length === 0}>
                            {isImporting ? 'Importando...' : 'Confirmar Importación'}
                        </Button>
                    </div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-md border dark:border-gray-700 min-h-[70px] flex flex-col justify-center">
                   <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Concepto seleccionado:</p>
                   <p className="text-sm text-gray-800 dark:text-gray-200">
                     {activeConcept || <span className="italic text-gray-400">Haga clic en un campo de categoría para ver el concepto completo aquí.</span>}
                   </p>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-[400px]">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0">
                        <tr>
                            <th className="p-2">Fecha</th>
                            <th className="p-2">Responsable</th>
                            <th className="p-2">Proveedor</th>
                            <th className="p-2">Concepto</th>
                            <th className="p-2 text-right">Importe ME</th>
                            <th className="p-2 text-right">TC</th>
                            <th className="p-2 text-right">Importe MN</th>
                            <th className="p-2">Categoría</th>
                            <th className="p-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {parsedData.map((p, index) => (
                            <tr key={index} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                                <td className="p-2 whitespace-nowrap">{formatDateToDDMMYYYY(p.date)}</td>
                                <td className="p-2">{p.responsible}</td>
                                <td className="p-2">{p.supplier}</td>
                                <td className="p-2 max-w-xs truncate" title={p.concept}>{p.concept}</td>
                                <td className="p-2 text-right font-mono text-blue-500">
                                    {p.amountME !== 0 ? p.amountME.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : ''}
                                </td>
                                <td className="p-2 text-right font-mono">
                                    {p.exchangeRate > 0 ? p.exchangeRate.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : ''}
                                </td>
                                <td className={`p-2 text-right font-mono ${p.amount < 0 ? 'text-red-500' : 'text-green-500'}`}>
                                    {p.amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                                </td>
                                <td className="p-1">
                                    <SearchableSelect
                                        value={p.guide || ''}
                                        onChange={(newValue) => handleGuideChange(index, newValue)}
                                        options={guides.map(g => ({ value: g.id, label: g.name }))}
                                        placeholder="Asignar categoría..."
                                        className="w-full"
                                        onFocus={() => setActiveConcept(p.concept)}
                                    />
                                </td>
                                <td className="p-1 text-center">
                                    <button onClick={() => handleDeleteRow(index)} className="text-gray-400 hover:text-red-600 p-1" title="Eliminar fila">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ScheduledPaymentsTable: React.FC = () => {
    const { scheduledPayments, deleteScheduledPayment, updateScheduledPayment, guides } = useAppContext();

    const getGuideName = useCallback((id: string) => guides.find(g => g.id === id)?.name || 'N/A', [guides]);

    const sortedPayments = useMemo(() => {
        const validPayments = scheduledPayments.filter(p => p.date && !isNaN(new Date(p.date).getTime()));
        return [...validPayments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [scheduledPayments]);
    
    const toggleSign = (payment: ScheduledPayment) => {
        updateScheduledPayment(payment.id, {
            amount: payment.amount * -1,
            amountME: payment.amountME * -1
        });
    };

    return (
        <Card className="mt-6 overflow-x-auto p-0 sm:p-0">
            <h3 className="text-lg font-semibold mb-4 px-4 sm:px-6 pt-4 sm:pt-6">Pagos Programados</h3>
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400 sticky top-0 z-10">
                    <tr>
                        <th scope="col" className="px-6 py-3">Fecha</th>
                        <th scope="col" className="px-6 py-3">Responsable</th>
                        <th scope="col" className="px-6 py-3">Proveedor</th>
                        <th scope="col" className="px-6 py-3">Concepto</th>
                        <th scope="col" className="px-6 py-3">Categoría</th>
                        <th scope="col" className="px-6 py-3 text-right">Importe M.E.</th>
                        <th scope="col" className="px-6 py-3 text-right">Tipo Cambio</th>
                        <th scope="col" className="px-6 py-3 text-right">Importe MN</th>
                        <th scope="col" className="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody>
                    {sortedPayments.map(p => (
                        <tr key={p.id} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                            <td className="px-6 py-4">{formatDateToDDMMYYYY(p.date)}</td>
                            <td className="px-6 py-4">{p.responsible}</td>
                            <td className="px-6 py-4">{p.supplier}</td>
                            <td className="px-6 py-4 max-w-xs truncate" title={p.concept}>{p.concept}</td>
                            <td className="px-6 py-4">{getGuideName(p.guide || '')}</td>
                            <td className={`px-6 py-4 text-right font-mono ${p.amountME < 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                {p.amountME !== 0 ? p.amountME.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : ''}
                            </td>
                            <td className="px-6 py-4 text-right font-mono">
                                {p.exchangeRate > 0 ? p.exchangeRate.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : ''}
                            </td>
                            <td className={`px-6 py-4 text-right font-mono cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${p.amount < 0 ? 'text-red-500' : 'text-green-500'}`}
                                onClick={() => toggleSign(p)}
                                title="Click para cambiar signo">
                                {p.amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                            </td>
                            <td className="px-6 py-4">
                                <button onClick={() => deleteScheduledPayment(p.id)} className="text-gray-500 hover:text-red-600">
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </td>
                        </tr>
                    ))}
                     {sortedPayments.length === 0 && (
                        <tr>
                            <td colSpan={9} className="text-center py-8 text-gray-500">No hay pagos programados.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </Card>
    );
}


const WeeklyFlowView: React.FC = () => {
    const [isImportModalOpen, setImportModalOpen] = useState(false);

    return (
        <div className="space-y-6">
            <Card>
                <div className="flex justify-end">
                     <Button onClick={() => setImportModalOpen(true)}>Pegar desde Excel</Button>
                </div>
            </Card>
            
            <Modal
              isOpen={isImportModalOpen}
              onClose={() => setImportModalOpen(false)}
              title="Importar Pagos Programados"
              maxWidth="7xl"
            >
                <ImportScheduledPaymentsFlow onComplete={() => setImportModalOpen(false)} />
            </Modal>

            <ScheduledPaymentsTable />
        </div>
    );
};

export default WeeklyFlowView;
