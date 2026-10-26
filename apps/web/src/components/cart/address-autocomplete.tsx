"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { FieldMessage } from "@/components/forms/field-message";
import { timedFetch, type ApiSchemas } from "@/lib/api-client";
import { browserApi } from "@/lib/browser-api";
import { isRequestAbort } from "@/lib/fetch-with-timeout";
import type { DeliveryAddressDetails } from "@/lib/requests-api";

type AddressSuggestion = ApiSchemas["AddressSuggestion"];

type AddressAutocompleteProps = {
  error?: string;
  inputClassName: string;
  onChange: () => void;
  onSuggestionSelect: (details: DeliveryAddressDetails) => void;
};

const suggestionsCache = new Map<string, AddressSuggestion[]>();

export function AddressAutocomplete({
  error,
  inputClassName,
  onChange,
  onSuggestionSelect,
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const normalizedQuery = query.trim();

    if (!isOpen || normalizedQuery.length < 3) {
      return;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      const cachedSuggestions = suggestionsCache.get(normalizedQuery);

      if (cachedSuggestions) {
        setSuggestions(cachedSuggestions);
        setActiveIndex(cachedSuggestions.length ? 0 : -1);
        return;
      }

      setIsLoading(true);
      setRequestError("");

      try {
        const { data: result } = await browserApi.GET("/address/suggestions", {
          params: { query: { query: normalizedQuery } },
          signal: abortController.signal,
          fetch: timedFetch(8_000),
        });

        if (!result) {
          throw new Error("Не удалось получить подсказки.");
        }

        suggestionsCache.set(normalizedQuery, result);
        setSuggestions(result);
        setActiveIndex(result.length ? 0 : -1);
        setIsOpen(true);
      } catch (requestError) {
        if (isRequestAbort(requestError)) {
          return;
        }

        setSuggestions([]);
        setRequestError("Подсказки временно недоступны. Адрес можно ввести вручную.");
      } finally {
        setIsLoading(false);
      }
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [isOpen, query]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setSuggestions([]);
    setActiveIndex(-1);
    setRequestError("");
    setIsOpen(true);
    onChange();
  };

  const selectSuggestion = (suggestion: AddressSuggestion) => {
    setQuery(suggestion.value);
    setSuggestions([]);
    setActiveIndex(-1);
    setIsOpen(false);
    onChange();
    onSuggestionSelect(suggestion.details);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        name="address"
        autoComplete="street-address"
        required
        value={query}
        onChange={handleChange}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!isOpen) setIsOpen(true);
            if (suggestions.length)
              setActiveIndex((current) =>
                current < 0
                  ? event.key === "ArrowDown"
                    ? 0
                    : suggestions.length - 1
                  : (current + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) %
                    suggestions.length,
              );
          } else if (event.key === "Enter" && isOpen && activeIndex >= 0) {
            event.preventDefault();
            const suggestion = suggestions[activeIndex];
            if (suggestion) selectSuggestion(suggestion);
          } else if (event.key === "Escape" && isOpen) {
            event.preventDefault();
            setIsOpen(false);
          }
        }}
        role="combobox"
        aria-invalid={Boolean(error)}
        aria-describedby={error || requestError ? "address-message" : undefined}
        aria-autocomplete="list"
        aria-controls="address-suggestions"
        aria-activedescendant={
          isOpen && activeIndex >= 0 ? `address-suggestion-${activeIndex}` : undefined
        }
        aria-expanded={isOpen && (suggestions.length > 0 || Boolean(requestError))}
        placeholder="Начните вводить адрес"
        className={inputClassName}
      />
      {isLoading ? (
        <LoadingSpinner
          label="Поиск адреса"
          className="pointer-events-none absolute right-3 top-[1.375rem] -translate-y-1/2"
        />
      ) : null}
      {isOpen && suggestions.length > 0 ? (
        <ul
          id="address-suggestions"
          role="listbox"
          className="absolute left-0 right-0 top-11 z-20 mt-1 max-h-64 overflow-y-auto border border-slate-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((suggestion, index) => (
            <li
              id={`address-suggestion-${index}`}
              key={suggestion.unrestrictedValue}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSuggestion(suggestion)}
                className={`w-full cursor-pointer px-3 py-2 text-left text-sm text-slate-700 transition-colors duration-200 ease-out hover:bg-red-50 hover:text-slate-950 focus-visible:bg-red-50 focus-visible:outline-2 focus-visible:outline-brand ${index === activeIndex ? "bg-red-50 text-slate-950" : ""}`}
              >
                {suggestion.value}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2">
        <FieldMessage
          id="address-message"
          message={error || requestError}
          tone={error ? "error" : "hint"}
          reserveMessage="Подсказки временно недоступны. Адрес можно ввести вручную."
        />
      </div>
    </div>
  );
}
