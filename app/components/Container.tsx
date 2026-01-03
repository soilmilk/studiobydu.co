import React from "react";

export default function Container({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-4 py-10">{children}</div>;
}
