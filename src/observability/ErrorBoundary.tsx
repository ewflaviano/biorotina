import { Component, type ReactNode } from "react";
import { reportClientError } from "./client";

interface Props {
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    reportClientError("runtime", "render_failure", "app_render");
  }

  render() {
    if (this.state.failed)
      return (
        <div className="app-loading error" role="alert">
          Não foi possível mostrar esta tela. Atualize a página para tentar
          novamente.
        </div>
      );
    return this.props.children;
  }
}
