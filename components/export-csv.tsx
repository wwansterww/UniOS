"use client";

import { Download } from "lucide-react";
import { Button } from "./ui";

/** Downloads a table as CSV that Excel opens correctly (UTF-8 BOM, ";" separator). */
export function ExportCsv({ filename, rows, label }: { filename: string; rows: (string | number)[][]; label: string }) {
  const download = () => {
    const cell = (v: string | number) => {
      const s = String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename.replace(/[\\/:*?"<>|]/g, "_") + ".csv" });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Button variant="outline" size="sm" onClick={download}>
      <Download size={14} /> {label}
    </Button>
  );
}
