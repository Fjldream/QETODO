import { useRegisterSW } from 'virtual:pwa-register/react';

import { UpdatePrompt } from './UpdatePrompt.js';

interface PwaUpdatePromptProps {
  editorDirty?: boolean;
  writesInFlight?: number;
}

export function PwaUpdatePrompt({ editorDirty = false, writesInFlight = 0 }: PwaUpdatePromptProps) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });
  return (
    <UpdatePrompt
      needRefresh={needRefresh}
      editorDirty={editorDirty}
      writesInFlight={writesInFlight}
      onDismiss={() => setNeedRefresh(false)}
      onUpdate={() => void updateServiceWorker(true)}
    />
  );
}
