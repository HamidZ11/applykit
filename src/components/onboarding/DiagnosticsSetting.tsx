import { useEffect, useId, useState } from 'react';
import {
  browserSettingsStore,
  type SettingsStore,
} from '@/storage/settings-store';

/**
 * "Developer diagnostics": whether the panel shows how it recognised each
 * field. Off by default; saved at once, apart from the profile. If the
 * setting cannot be saved, the box returns to what is saved and says so.
 */
export function DiagnosticsSetting({
  store = browserSettingsStore,
}: {
  store?: SettingsStore;
}) {
  const [on, setOn] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const hint = useId();

  useEffect(() => {
    let active = true;
    void store.loadDiagnostics().then((value) => {
      if (active) setOn(value);
    });
    return () => {
      active = false;
    };
  }, [store]);

  return (
    <div className="px-2">
      <label className="flex cursor-default items-center gap-2 text-xs text-ink-2">
        <input
          type="checkbox"
          checked={on ?? false}
          disabled={on === null}
          aria-describedby={hint}
          onChange={(event) => {
            const next = event.target.checked;
            setOn(next);
            setFailed(false);
            void store.saveDiagnostics(next).then((saved) => {
              if (saved) return;
              setOn(!next);
              setFailed(true);
            });
          }}
          className="size-3.5 rounded-xs accent-accent"
        />
        Developer diagnostics
      </label>
      <p id={hint} className="mt-0.5 pl-[22px] text-2xs text-ink-3">
        Shows in the panel how ApplyKit recognised each field.
      </p>
      {failed && (
        <p role="alert" className="mt-0.5 pl-[22px] text-2xs text-danger">
          Could not save this setting. Try again.
        </p>
      )}
    </div>
  );
}
