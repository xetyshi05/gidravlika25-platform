type HoneypotFieldProps = {
  id: string;
};

export function HoneypotField({ id }: HoneypotFieldProps) {
  return (
    <div aria-hidden="true" className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
      <label htmlFor={id}>Ваш сайт</label>
      <input id={id} name="website" type="text" tabIndex={-1} autoComplete="off" />
    </div>
  );
}
