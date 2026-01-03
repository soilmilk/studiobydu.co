export default function Footer() {
  return (
    <footer className="border-t border-neutral-200">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 text-sm rgb(var(--muted))">
        <div className="flex-col gap-1">
          <p>© {new Date().getFullYear()} Du's Studio</p>
        </div>
      </div>
    </footer>
  );
}
