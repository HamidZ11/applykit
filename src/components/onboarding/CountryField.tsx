import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import {
  countryName,
  findCountryCode,
  searchCountries,
  type Country,
} from '@/domain/countries';
import { Icon } from '@/components/ui/icons';
import { CONTROL, CONTROL_STATE, Field } from './fields';

interface CountryFieldProps {
  label: string;
  /** ISO 3166-1 alpha-2 code, or "" when none is chosen. */
  value: string;
  error?: string | undefined;
  onValueChange: (code: string) => void;
}

/** Leave room for the sticky action bar when deciding where the list opens. */
const FOOTER_ALLOWANCE = 64;
const LIST_HEIGHT = 264;

/**
 * A searchable country selector following the ARIA combobox pattern: type
 * to filter, ↑/↓ to move, Enter to choose, Escape to cancel. Shows country
 * names; reports ISO codes.
 */
export function CountryField({
  label,
  value,
  error,
  onValueChange,
}: CountryFieldProps) {
  return (
    <Field label={label} error={error}>
      {({ id, invalid, describedBy }) => (
        <CountryCombobox
          id={id}
          invalid={invalid}
          describedBy={describedBy}
          value={value}
          onValueChange={onValueChange}
        />
      )}
    </Field>
  );
}

function CountryCombobox({
  id,
  invalid,
  describedBy,
  value,
  onValueChange,
}: {
  id: string;
  invalid: boolean;
  describedBy: string | undefined;
  value: string;
  onValueChange: (code: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  /** What the user is typing; null shows the selected country's name. */
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [upward, setUpward] = useState(false);

  const results = useMemo(() => searchCountries(query ?? ''), [query]);
  const listId = `${id}-countries`;
  const optionId = (country: Country) => `${id}-country-${country.code}`;
  const activeCountry = open ? results[active] : undefined;

  const activeCode = activeCountry?.code;
  useEffect(() => {
    if (!activeCode) return;
    list.current
      ?.querySelector(`#${CSS.escape(`${id}-country-${activeCode}`)}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeCode, id]);

  const openList = (from: Country[] = results) => {
    const rect = input.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom - FOOTER_ALLOWANCE;
      setUpward(below < LIST_HEIGHT && rect.top > below);
    }
    const selected = from.findIndex((country) => country.code === value);
    setActive(Math.max(selected, 0));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setQuery(null);
  };

  const choose = (country: Country) => {
    onValueChange(country.code);
    close();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openList();
        else setActive((index) => Math.min(index + 1, results.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openList();
        else setActive((index) => Math.max(index - 1, 0));
        break;
      case 'Enter':
        if (open && activeCountry) {
          event.preventDefault();
          choose(activeCountry);
        }
        break;
      case 'Escape':
        if (open || query !== null) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        break;
    }
  };

  return (
    <div className="relative">
      <input
        ref={input}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search countries"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={
          activeCountry ? optionId(activeCountry) : undefined
        }
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={query ?? countryName(value)}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          openList(searchCountries(next));
          setActive(0);
        }}
        onClick={() => {
          if (!open) openList();
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Accept an exact name, alias or code typed without choosing.
          const typed = query === null ? null : findCountryCode(query);
          if (typed) onValueChange(typed);
          close();
        }}
        className={`${CONTROL} ${CONTROL_STATE(invalid)} h-9 pr-9 pl-3`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? 'Close country list' : 'Show all countries'}
        onMouseDown={(event) => {
          event.preventDefault();
          input.current?.focus();
          if (open) close();
          else openList();
        }}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink-3 hover:text-ink"
      >
        <Icon icon={ChevronsUpDown} size={14} />
      </button>

      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label="Countries"
          className={`absolute right-0 left-0 z-30 max-h-[264px] animate-[ak-fade-in_120ms_var(--ease-out)] overflow-y-auto overscroll-contain rounded-md border border-line bg-white p-1 shadow-panel ${
            upward ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {results.length === 0 ? (
            <li role="presentation" className="px-2.5 py-2 text-ink-3">
              No countries match “{query}”
            </li>
          ) : (
            results.map((country, index) => {
              const selected = country.code === value;
              return (
                <li
                  key={country.code}
                  id={optionId(country)}
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(event) => {
                    // Keep focus in the input so blur does not close first.
                    event.preventDefault();
                  }}
                  onMouseMove={() => {
                    if (index !== active) setActive(index);
                  }}
                  onClick={() => {
                    choose(country);
                  }}
                  className={`flex h-8 items-center gap-2 rounded-sm px-2.5 ${
                    index === active ? 'bg-hover' : ''
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {country.name}
                  </span>
                  {selected && (
                    <Icon icon={Check} size={14} className="text-accent" />
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
