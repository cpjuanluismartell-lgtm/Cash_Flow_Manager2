
import React, { useState } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { CatalogType } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { TrashIcon } from '../icons/IconComponents';

interface CatalogManagerProps {
    title: string;
    items: { id: string, name: string, subtext?: string }[];
    onAdd: (value1: string, value2?: string) => void;
    onDelete: (id: string) => void;
    inputLabel1: string;
    inputLabel2?: string;
}

const CatalogManager: React.FC<CatalogManagerProps> = ({ title, items, onAdd, onDelete, inputLabel1, inputLabel2 }) => {
    const [value1, setValue1] = useState('');
    const [value2, setValue2] = useState('');

    const handleAdd = () => {
        if (value1) {
            onAdd(value1, value2);
            setValue1('');
            setValue2('');
        }
    };
    
    return (
        <Card>
            <h3 className="text-lg font-semibold mb-4">{title}</h3>
            <div className="flex gap-2 mb-4">
                <Input placeholder={inputLabel1} value={value1} onChange={e => setValue1(e.target.value)} />
                {inputLabel2 && <Input placeholder={inputLabel2} value={value2} onChange={e => setValue2(e.target.value)} />}
                <Button onClick={handleAdd}>Agregar</Button>
            </div>
            <ul className="divide-y dark:divide-gray-700 max-h-60 overflow-y-auto">
                {items.map(item => (
                    <li key={item.id} className="flex justify-between items-start gap-2 py-2">
                        <div className="flex-1">
                            <p className="break-words">{item.name}</p>
                            {item.subtext && <p className="text-xs text-gray-500 break-words">{item.subtext}</p>}
                        </div>
                        <button onClick={() => onDelete(item.id)} className="text-gray-500 hover:text-red-600 flex-shrink-0">
                            <TrashIcon className="w-4 h-4" />
                        </button>
                    </li>
                ))}
            </ul>
        </Card>
    );
};


const CatalogsView: React.FC = () => {
    const { 
        banks, addBank, 
        guides, addGuide, 
        debitCards, addDebitCard,
        deleteCatalogItem
    } = useAppContext();

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <CatalogManager 
                title="Bancos"
                items={banks.map(b => ({ id: b.id, name: b.name }))}
                onAdd={(name) => addBank(name)}
                onDelete={(id) => deleteCatalogItem('banks', id)}
                inputLabel1="Nombre del Banco"
            />
             <CatalogManager 
                title="Guías / Categorías"
                items={guides.map(g => ({ id: g.id, name: g.name }))}
                onAdd={(name) => addGuide(name)}
                onDelete={(id) => deleteCatalogItem('guides', id)}
                inputLabel1="Nombre de la Guía"
            />
            <CatalogManager 
                title="Tarjetas de Débito"
                items={debitCards.map(d => ({ id: d.id, name: d.assignedTo, subtext: d.cardNumber }))}
                onAdd={(assignedTo, cardNumber) => addDebitCard(cardNumber || '', assignedTo)}
                onDelete={(id) => deleteCatalogItem('debitCards', id)}
                inputLabel1="Asignado a"
                inputLabel2="Número de Tarjeta"
            />
        </div>
    );
};

export default CatalogsView;