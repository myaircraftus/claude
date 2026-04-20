"use client";

import { useState } from "react";
import { X, Save, Download, Share2, Mail, Printer, CheckCircle } from "lucide-react";
import type { ArtifactType } from "./chatEngine";
import { useDataStore, type LogbookEntry, type WorkOrder, type Invoice } from "./DataStore";
import { PartsLookupPanel } from "./PartsLookupPanel";
import { toast } from "sonner";

interface EnhancedArtifactPanelProps {
  type: ArtifactType;
  data: any;
  onClose: () => void;
}

export function EnhancedArtifactPanel({ type, data, onClose }: EnhancedArtifactPanelProps) {
  const { addLogbookEntry, addWorkOrder, addInvoice, updateLogbookEntry, updateWorkOrder, updateInvoice } = useDataStore();

  const handleSave = () => {
    try {
      if (type === "logbook-entry") {
        const entry: Omit<LogbookEntry, "id" | "createdAt" | "updatedAt"> = {
          aircraft: data.aircraft,
          makeModel: data.makeModel,
          serial: data.serial,
          engine: data.engine,
          date: data.date,
          type: data.type,
          body: data.body,
          mechanic: data.mechanic,
          certificateNumber: data.certificateNumber,
          status: "draft",
          totalTime: data.totalTime,
          hobbs: data.hobbs,
          tach: data.tach,
        };
        
        if (data.id) {
          updateLogbookEntry(data.id, entry);
          toast.success("Logbook entry updated");
        } else {
          addLogbookEntry(entry);
          toast.success("Logbook entry saved");
        }
      } else if (type === "work-order") {
        const wo: Omit<WorkOrder, "id" | "createdAt" | "updatedAt"> = {
          woNumber: data.woNumber,
          aircraft: data.aircraft,
          makeModel: data.makeModel,
          serial: data.serial,
          customer: data.customer,
          company: data.company,
          mechanic: data.mechanic,
          openedDate: data.openedDate || new Date().toISOString(),
          status: data.status || "Open",
          squawk: data.squawk || "",
          discrepancy: data.discrepancy || "",
          correctiveAction: data.correctiveAction || "",
          findings: data.findings || "",
          laborLines: data.laborLines || [],
          partsLines: data.partsLines || [],
          outsideServices: data.outsideServices || [],
          internalNotes: data.internalNotes || "",
          customerNotes: data.customerNotes || "",
          totalLabor: data.totalLabor || 0,
          totalParts: data.totalParts || 0,
          totalOutside: data.totalOutside || 0,
          grandTotal: data.grandTotal || 0,
        };
        
        if (data.id) {
          updateWorkOrder(data.id, wo);
          toast.success("Work order updated");
        } else {
          addWorkOrder(wo);
          toast.success("Work order saved");
        }
      } else if (type === "invoice") {
        const invoice: Omit<Invoice, "id" | "createdAt" | "updatedAt"> = {
          invoiceNumber: data.invoiceNumber,
          aircraft: data.aircraft,
          customer: data.customer,
          company: data.company,
          issuedDate: data.issuedDate || new Date().toISOString().split("T")[0],
          dueDate: data.dueDate || "",
          status: data.status || "Draft",
          laborLines: data.laborLines || [],
          partsLines: data.partsLines || [],
          outsideServices: data.outsideServices || [],
          subtotalLabor: data.subtotalLabor || 0,
          subtotalParts: data.subtotalParts || 0,
          subtotalOutside: data.subtotalOutside || 0,
          taxRate: data.taxRate || 0.0825,
          tax: data.tax || 0,
          shipping: data.shipping || 0,
          total: data.total || 0,
          notes: data.notes || "",
          paymentStatus: data.paymentStatus || "Unpaid",
          amountPaid: data.amountPaid || 0,
          linkedWorkOrder: data.linkedWorkOrder,
        };
        
        if (data.id) {
          updateInvoice(data.id, invoice);
          toast.success("Invoice updated");
        } else {
          addInvoice(invoice);
          toast.success("Invoice saved");
        }
      }
    } catch (error) {
      toast.error("Failed to save");
      console.error(error);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white border-l border-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-primary" />
          <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
            {type === "logbook-entry" && "Logbook Entry"}
            {type === "work-order" && `Work Order ${data?.woNumber}`}
            {type === "invoice" && `Invoice ${data?.invoiceNumber}`}
            {type === "parts-lookup" && "Parts Lookup"}
            {type === "customer-card" && "Customer Profile"}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          {type !== "parts-lookup" && (
            <>
              <button
                onClick={handleSave}
                className="p-1.5 hover:bg-primary/10 rounded text-primary transition-colors"
                title="Save"
              >
                <Save className="w-4 h-4" />
              </button>
              <button
                className="p-1.5 hover:bg-muted rounded text-muted-foreground transition-colors"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                className="p-1.5 hover:bg-muted rounded text-muted-foreground transition-colors"
                title="Share"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-muted rounded text-muted-foreground transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {type === "parts-lookup" && (
          <PartsLookupPanel
            initialQuery={data?.query || ""}
            aircraft={data?.aircraft || "N12345"}
          />
        )}
        {type !== "parts-lookup" && (
          <div className="text-[13px] text-muted-foreground">
            Artifact content panel for {type}. Use the save button above to persist data.
            <pre className="mt-4 p-3 bg-muted/50 rounded-lg text-[11px] overflow-auto">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Footer actions */}
      {type !== "parts-lookup" && (
        <div className="px-4 py-3 border-t border-border shrink-0">
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-primary text-white text-[13px] hover:bg-primary/90 transition-colors"
              style={{ fontWeight: 500 }}
            >
              <Save className="w-4 h-4" /> Save to Database
            </button>
            <button
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border text-[13px] hover:bg-muted transition-colors"
              style={{ fontWeight: 500 }}
            >
              <Mail className="w-4 h-4" /> Email
            </button>
            <button
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border text-[13px] hover:bg-muted transition-colors"
              style={{ fontWeight: 500 }}
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
