"use client";

import type { Toast } from "@/hooks/useToast";

interface Props {
  toasts: Toast[];
}

export default function ToastStack({ toasts }: Props) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-fade-in ${
            toast.type === "success"
              ? "bg-success text-white"
              : toast.type === "error"
                ? "bg-error text-white"
                : "bg-accent text-white"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
