import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { OnboardingApp } from '@/components/onboarding/OnboardingApp';
import { loadPanelFonts } from '@/page/fonts';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

void loadPanelFonts().finally(() => {
  ReactDOM.createRoot(root).render(
    <StrictMode>
      <OnboardingApp />
    </StrictMode>,
  );
});
