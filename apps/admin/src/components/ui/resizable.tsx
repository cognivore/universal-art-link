"use client";

import * as React from 'react';
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
  type PanelGroupProps,
  type PanelProps,
  type PanelResizeHandleProps
} from 'react-resizable-panels';
import { cn } from '../../lib/utils';

export const ResizablePanelGroup = ({ className, ...props }: PanelGroupProps) => (
  <PanelGroup className={cn('flex w-full gap-3', className)} {...props} />
);

export const ResizablePanel = Panel;

export const ResizableHandle = ({ className, ...props }: PanelResizeHandleProps) => (
  <PanelResizeHandle className={cn('relative flex w-3 items-center justify-center', className)} {...props}>
    <div className="h-14 w-1 rounded-full bg-border" />
  </PanelResizeHandle>
);

