import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Fragment } from "react";
import { IconButton, Kbd } from "../../components/ui/primitives";
import { isMacPlatform, SHORTCUT_HELP } from "./model/shortcuts";

export function ShortcutHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const mod = isMacPlatform() ? "⌘" : "Ctrl";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pl-dialog-overlay" />
        <Dialog.Content
          className="pl-dialog st-help"
          tabIndex={-1}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
        >
          <div className="cr-dialog__head">
            <div>
              <Dialog.Title className="pl-dialog__title">Keyboard shortcuts</Dialog.Title>
              <Dialog.Description className="pl-dialog__desc">Plant Studio canvas. Shortcuts pause while you type in a field.</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton label="Close" icon={<X />} />
            </Dialog.Close>
          </div>
          <div className="st-help__groups">
            {SHORTCUT_HELP.map((g) => (
              <section key={g.group}>
                <h3>{g.group}</h3>
                <dl>
                  {g.items.map((item) => (
                    <Fragment key={item.label}>
                      <dt>
                        {item.keys.map((k, i) => (
                          <Fragment key={i}>
                            {i ? <span className="st-help__plus">+</span> : null}
                            <Kbd>{k === "Mod" ? mod : k}</Kbd>
                          </Fragment>
                        ))}
                      </dt>
                      <dd>{item.label}</dd>
                    </Fragment>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
