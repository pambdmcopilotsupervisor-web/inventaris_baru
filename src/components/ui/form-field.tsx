import React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface FormFieldProps {
  label: string
  error?: string
  required?: boolean
  children?: React.ReactNode
  className?: string
}

export function FormField({ label, error, required, children, className }: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}{required && <span className="ml-1" style={{ color: "var(--danger)" }}>*</span>}
      </label>
      {children}
      {error && <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  )
}

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  required?: boolean
}

export function TextField({ label, error, required, className, ...props }: TextFieldProps) {
  return (
    <FormField label={label} error={error} required={required} className={className}>
      <Input {...props} style={error ? { borderColor: "var(--danger)" } : undefined} />
    </FormField>
  )
}

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
  required?: boolean
  options: { value: string; label: string }[]
  placeholder?: string
}

export function SelectField({ label, error, required, options, placeholder, className, ...props }: SelectFieldProps) {
  return (
    <FormField label={label} error={error} required={required} className={className}>
      <select
        {...props}
        className="flex h-8 w-full rounded-lg px-3 py-1 text-sm transition-all duration-150 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        style={{
          border: `1px solid ${error ? "var(--danger)" : "var(--border-strong)"}`,
          background: "var(--surface)",
          color: "var(--text-900)",
          fontFamily: "var(--font-body)",
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; props.onFocus?.(e) }}
        onBlur={(e) => { e.currentTarget.style.borderColor = error ? "var(--danger)" : "var(--border-strong)"; props.onBlur?.(e) }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </FormField>
  )
}

interface TextareaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
  required?: boolean
}

export function TextareaField({ label, error, required, className, ...props }: TextareaFieldProps) {
  return (
    <FormField label={label} error={error} required={required} className={className}>
      <textarea
        {...props}
        rows={3}
        className="flex w-full rounded-lg px-3 py-2 text-sm transition-all duration-150 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
        style={{
          border: `1px solid ${error ? "var(--danger)" : "var(--border-strong)"}`,
          background: "var(--surface)",
          color: "var(--text-900)",
          fontFamily: "var(--font-body)",
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; props.onFocus?.(e) }}
        onBlur={(e) => { e.currentTarget.style.borderColor = error ? "var(--danger)" : "var(--border-strong)"; props.onBlur?.(e) }}
      />
    </FormField>
  )
}
