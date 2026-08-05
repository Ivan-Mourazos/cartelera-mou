interface BrandMarkProps {
  compact?: boolean;
  productName: string;
}

export function BrandMark({ compact = false, productName }: BrandMarkProps) {
  return (
    <div className={`brand-mark ${compact ? "brand-mark--compact" : ""}`}>
      <svg className="brand-mark__symbol" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <path d="M8 11.5h18.5v17H8z" />
        <path d="M13.5 7H32v17H13.5z" />
        <path className="brand-mark__splice" d="M17 7v22" />
      </svg>
      {compact ? null : <span className="brand-mark__name">{productName}</span>}
    </div>
  );
}
