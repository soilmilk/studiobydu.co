"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { StepperId } from "@/app/content/notes/types";
import { steppers } from ".";

export default function StepperDialog({
  stepper,
  onClose,
}: {
  stepper: { id: StepperId; title: string; start?: string } | null;
  onClose: () => void;
}) {
  const Body = stepper ? steppers[stepper.id] : null;
  return (
    <Dialog.Root open={!!stepper} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <Dialog.Content
          className="fixed inset-x-2 top-2 bottom-2 z-50 overflow-y-auto rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-neutral-900 shadow-2xl outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 sm:inset-x-6 sm:top-6 sm:bottom-6 sm:p-6 lg:left-1/2 lg:right-auto lg:w-[1040px] lg:-translate-x-1/2"
          aria-describedby={undefined}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <Dialog.Title className="text-xl font-semibold tracking-tight">{stepper?.title}</Dialog.Title>
            <Dialog.Close className="rounded-md px-2 py-1 text-lg leading-none hover:bg-neutral-200 dark:hover:bg-neutral-800" aria-label="Close">
              ✕
            </Dialog.Close>
          </div>
          {Body && <Body start={stepper?.start} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
