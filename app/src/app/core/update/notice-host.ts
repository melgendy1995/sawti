export interface BlockingNotice {
  arabic: string;
  actionLabel: string;
  href?: string;
  onAction?: () => void;
}

const NOTICE_ID = 'sawti-update-notice';

export function showBlockingNotice(notice: BlockingNotice): void {
  clearBlockingNotice();
  const root = document.createElement('div');
  root.id = NOTICE_ID;
  root.setAttribute('role', 'alertdialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'sawti-update-notice-title');
  root.lang = 'ar';
  root.dir = 'rtl';

  const style = root.style;
  style.position = 'fixed';
  style.inset = '0';
  style.zIndex = '1000';
  style.display = 'grid';
  style.placeItems = 'center';
  style.padding = '1.5rem';
  style.background = '#f4f7f6';
  style.color = '#10211e';
  style.fontFamily = '"IBM Plex Sans Arabic", "Noto Sans Arabic", sans-serif';

  const panel = document.createElement('div');
  panel.style.maxWidth = '36rem';
  panel.style.display = 'grid';
  panel.style.gap = '1rem';

  const title = document.createElement('p');
  title.id = 'sawti-update-notice-title';
  title.textContent = notice.arabic;
  title.style.margin = '0';
  title.style.fontSize = '1.4rem';
  title.style.lineHeight = '1.7';

  const action = notice.href ? document.createElement('a') : document.createElement('button');
  action.textContent = notice.actionLabel;
  if (action instanceof HTMLButtonElement) {
    action.type = 'button';
  }
  if (action instanceof HTMLAnchorElement && notice.href) {
    action.href = notice.href;
    action.target = '_blank';
    action.rel = 'noopener noreferrer';
  }
  action.style.justifySelf = 'start';
  action.style.padding = '0.7rem 1rem';
  action.style.font = 'inherit';
  action.style.fontSize = '1.1rem';
  action.style.color = '#f4f7f6';
  action.style.background = '#0a7d6b';
  action.style.border = '0';
  action.style.borderRadius = '12px';
  action.style.textDecoration = 'none';
  action.addEventListener('click', () => {
    notice.onAction?.();
  });

  panel.append(title, action);
  root.append(panel);
  document.body.append(root);
}

export function clearBlockingNotice(): void {
  document.getElementById(NOTICE_ID)?.remove();
}
