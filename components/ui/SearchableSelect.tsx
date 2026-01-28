import React, { useState, useEffect, useRef, useMemo } from 'react';

interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onFocus?: () => void;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ options, value, onChange, placeholder = 'Buscar categoría...', className = '', onFocus }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = useMemo(() => options.find(option => option.value === value), [options, value]);

  useEffect(() => {
    setSearchTerm(selectedOption ? selectedOption.label : '');
  }, [value, selectedOption]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm(selectedOption ? selectedOption.label : '');
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef, selectedOption]);

  const filteredOptions = useMemo(() => {
    const normalize = (str: string) => 
      str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const normalizedSearchTerm = normalize(searchTerm);
    
    return options.filter(option =>
      normalize(option.label).includes(normalizedSearchTerm)
    );
  }, [options, searchTerm]);

  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(0);
    }
  }, [isOpen, searchTerm]);

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
        const listElement = listRef.current;
        const highlightedItem = listElement.children[highlightedIndex] as HTMLLIElement;
        if (highlightedItem) {
            highlightedItem.scrollIntoView({ block: 'nearest' });
        }
    }
  }, [highlightedIndex, isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    if (!isOpen) {
      setIsOpen(true);
    }
  };

  const handleOptionClick = (option: SearchableSelectOption) => {
    onChange(option.value);
    setSearchTerm(option.label);
    setIsOpen(false);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    if (onFocus) {
      onFocus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => (prev + 1) % filteredOptions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          handleOptionClick(filteredOptions[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchTerm(selectedOption ? selectedOption.label : '');
        break;
      default:
        break;
    }
  };


  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <input
        type="text"
        className="w-full px-3 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-sm"
        value={searchTerm}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Searchable select input"
        autoComplete="off"
      />
      {isOpen && (
        <ul ref={listRef} className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => {
              const isHighlighted = index === highlightedIndex;
              return (
                <li
                  key={option.value}
                  className={`px-3 py-2 cursor-pointer text-sm ${
                    isHighlighted ? 'bg-primary-100 dark:bg-gray-700' : 'hover:bg-primary-100 dark:hover:bg-gray-700'
                  } ${option.value === value ? 'font-medium' : ''}`}
                  onClick={() => handleOptionClick(option)}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {option.label}
                </li>
              );
            })
          ) : (
            <li className="px-3 py-2 text-gray-500 text-sm">No se encontraron coincidencias</li>
          )}
        </ul>
      )}
    </div>
  );
};

export default SearchableSelect;