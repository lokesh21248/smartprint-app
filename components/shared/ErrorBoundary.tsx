"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center border border-gray-100">
            <div className="w-20 h-20 rounded-3xl bg-rose-50 flex items-center justify-center mx-auto mb-6 shadow-inner">
              <AlertCircle className="w-10 h-10 text-rose-500" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Something went wrong</h1>
            <p className="text-gray-500 font-medium mb-8 leading-relaxed">
              An unexpected error occurred in this section of the dashboard.
            </p>
            <div className="flex gap-3">
              <Button 
                onClick={() => this.setState({ hasError: false })} 
                variant="outline"
                className="flex-1 h-14 rounded-2xl border-gray-200 font-bold gap-2"
              >
                <RefreshCcw className="w-4 h-4" /> Try Again
              </Button>
              <Button 
                onClick={() => window.location.href = "/"} 
                className="flex-1 h-14 rounded-2xl bg-gray-900 hover:bg-black text-white font-bold"
              >
                Go Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
