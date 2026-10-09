import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Changing this clears the error, so moving to another page recovers. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

const RELOAD_KEY = 'troystack_chunk_reload';

function isStaleChunk(error: Error): boolean {
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk/i.test(error.message);
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // After a deploy, an open tab can ask for page code that no longer exists.
    // One reload picks up the new build.
    if (isStaleChunk(error)) {
      try {
        if (!sessionStorage.getItem(RELOAD_KEY)) {
          sessionStorage.setItem(RELOAD_KEY, '1');
          window.location.reload();
          return;
        }
      } catch {
        // storage blocked, fall through to the message
      }
    }
    console.error('Page error', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <h2 className="text-[20px] font-semibold text-fg">This page hit a snag</h2>
        <p className="mt-2 text-[14px] text-fg-2">Reloading usually fixes it. If it keeps happening, email support@troystack.com and we'll look at it.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 inline-flex h-10 items-center rounded-xl bg-btn px-5 text-sm font-semibold text-btn-fg hover:bg-btn-hover"
        >
          Reload
        </button>
      </div>
    );
  }
}
