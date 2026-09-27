import { useState } from 'react'
import { Share, Smartphone, SquarePlus } from 'lucide-react'
import { useInstall } from './pwa.ts'
import { Button, Sheet, Tag } from './ui.tsx'

/** "Add to home screen": the browser's install dialog on Android, step-by-step help on iPhone. */
export function InstallBanner() {
  const install = useInstall()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('install-dismissed') === '1'
    } catch {
      return false
    }
  })
  const [help, setHelp] = useState(false)
  if (install.installed || dismissed || (!install.canPrompt && !install.ios)) return null
  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl bg-brand p-3.5 text-on-brand">
        <Smartphone className="size-6 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Add PaiseGuru to your home screen</p>
          <button
            type="button"
            className="text-[13px] opacity-80 underline-offset-2 hover:underline"
            onClick={() => {
              setDismissed(true)
              try {
                localStorage.setItem('install-dismissed', '1')
              } catch {}
            }}
          >
            Not now
          </button>
        </div>
        <Button size="sm" variant="secondary" onClick={() => (install.canPrompt ? install.install() : setHelp(true))}>
          Install
        </Button>
      </div>
      <InstallHelp open={help} onClose={() => setHelp(false)} />
    </>
  )
}

export function InstallHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Install on iPhone">
      <ol className="flex flex-col gap-3 text-[15px]">
        <li className="flex items-center gap-3">
          <Tag>1</Tag> Tap the <Share className="inline size-5" aria-label="Share" /> Share button in Safari
        </li>
        <li className="flex items-center gap-3">
          <Tag>2</Tag> Choose <SquarePlus className="inline size-5" aria-hidden /> <b>Add to Home Screen</b>
        </li>
        <li className="flex items-center gap-3">
          <Tag>3</Tag> Tap <b>Add</b>. PaiseGuru opens full-screen from its icon.
        </li>
      </ol>
      <Button onClick={onClose}>Done</Button>
    </Sheet>
  )
}
