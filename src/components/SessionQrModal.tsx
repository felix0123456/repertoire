"use client";

import React, { useMemo, useState } from "react";
import {
  X,
  Copy,
  Check,
  Share2,
  Download,
  Printer,
  Maximize2,
  Minimize2,
  QrCode,
} from "lucide-react";
import { RehearsalSessionItem } from "@/types";
import { generateQrMatrix, generateQrSvgString } from "@/lib/qrcode";
import {
  buildAppShareUrl,
  copyTextToClipboard,
  shareOrCopyLink,
} from "@/lib/share";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface SessionQrModalProps {
  session: RehearsalSessionItem | null;
  onClose: () => void;
}

export default function SessionQrModal({
  session,
  onClose,
}: SessionQrModalProps) {
  const [copied, setCopied] = useState(false);
  const [sharedFeedback, setSharedFeedback] = useState(false);
  const [fullscreenPoster, setFullscreenPoster] = useState(false);

  const shareUrl = useMemo(() => {
    if (!session) return "";
    const targetTab =
      session.status === "COMPLETED" ? "historie" : "probeplan";
    return buildAppShareUrl({
      tab: targetTab,
      session: session.id,
    });
  }, [session]);

  const qrData = useMemo(() => {
    if (!shareUrl) return null;
    try {
      const matrix = generateQrMatrix(shareUrl);
      const margin = 4;
      const totalModules = matrix.length + margin * 2;
      const paths: string[] = [];
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix.length; c++) {
          if (matrix[r][c]) {
            paths.push(`M${c + margin},${r + margin}h1v1h-1z`);
          }
        }
      }
      return {
        totalModules,
        pathData: paths.join(""),
      };
    } catch (err) {
      console.error("Failed to generate QR matrix:", err);
      return null;
    }
  }, [shareUrl]);

  if (!session) return null;

  const formattedDate = session.scheduledDate
    ? new Date(session.scheduledDate).toLocaleString("de-DE", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Flexibler Termin (ohne festes Datum)";

  const handleCopyLink = async () => {
    const ok = await copyTextToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    }
  };

  const handleNativeShare = async () => {
    const piecePreview =
      session.pieces.length > 0
        ? `Programm (${session.pieces.length} Stücke): ${session.pieces
            .slice(0, 6)
            .map(
              (sp, i) =>
                `${i + 1}. ${sp.piece.title}${
                  sp.piece.folderNumber ? ` (#${sp.piece.folderNumber})` : ""
                }`
            )
            .join(", ")}${session.pieces.length > 6 ? " ..." : ""}`
        : "Programmfolge wird im Probeplan zusammengestellt.";

    const res = await shareOrCopyLink({
      url: shareUrl,
      title: `Probe #${String(session.sessionNumber).padStart(2, "0")}: ${
        session.title
      }`,
      text: `Direktlink zur Probe #${String(session.sessionNumber).padStart(
        2,
        "0"
      )} (${session.title}) — ${formattedDate}${
        session.location ? ` • Ort: ${session.location}` : ""
      }.\n${piecePreview}`,
      useNativeShareIfAvailable: true,
    });

    if (res === "shared" || res === "copied") {
      setSharedFeedback(true);
      setCopied(true);
      setTimeout(() => {
        setSharedFeedback(false);
        setCopied(false);
      }, 2400);
    }
  };

  const handleDownloadSvg = () => {
    const svgString = generateQrSvgString(shareUrl, {
      margin: 4,
      darkColor: "#141311",
      lightColor: "#FDFBF7",
      size: 640,
    });
    const blob = new Blob([svgString], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `probe-${String(session.sessionNumber).padStart(
      2,
      "0"
    )}-qr-code.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintPoster = () => {
    const svgString = generateQrSvgString(shareUrl, {
      margin: 4,
      darkColor: "#141311",
      lightColor: "#FFFFFF",
      size: 360,
    });

    const printWindow = window.open("", "_blank", "width=800,height=900");
    if (!printWindow) {
      window.print();
      return;
    }

    const piecesHtml =
      session.pieces.length > 0
        ? session.pieces
            .map(
              (sp, i) =>
                `<tr>
                  <td style="padding:6px 8px;border-bottom:1px solid #D6CFC1;font-family:monospace;font-weight:700;">${String(
                    i + 1
                  ).padStart(2, "0")}</td>
                  <td style="padding:6px 8px;border-bottom:1px solid #D6CFC1;font-weight:600;">${escapeHtml(
                    sp.piece.title
                  )}</td>
                  <td style="padding:6px 8px;border-bottom:1px solid #D6CFC1;font-family:monospace;">${
                    sp.piece.folderNumber
                      ? `Mappe #${escapeHtml(sp.piece.folderNumber)}`
                      : "—"
                  }</td>
                  <td style="padding:6px 8px;border-bottom:1px solid #D6CFC1;font-size:12px;color:#57534C;">${escapeHtml(
                    sp.piece.singers || "Instrumental"
                  )}</td>
                </tr>`
            )
            .join("")
        : `<tr><td colspan="4" style="padding:12px;text-align:center;color:#57534C;">Noch keine Stücke eingeplant</td></tr>`;

    printWindow.document.write(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Proben-Aushang #${String(session.sessionNumber).padStart(2, "0")} — ${escapeHtml(
      session.title
    )}</title>
  <style>
    body {
      font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #141311;
      background: #FFFFFF;
      margin: 0;
      padding: 32px;
    }
    .sheet {
      max-width: 680px;
      margin: 0 auto;
      border: 2px solid #141311;
      padding: 28px;
    }
    .kicker {
      font-family: monospace;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #57534C;
    }
    h1 {
      font-family: Georgia, serif;
      font-size: 28px;
      margin: 6px 0 4px 0;
    }
    .meta {
      font-family: monospace;
      font-size: 13px;
      color: #57534C;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid #D6CFC1;
    }
    .qr-box {
      text-align: center;
      margin: 20px 0;
      padding: 20px;
      border: 2px solid #141311;
      background: #FDFBF7;
    }
    .url-text {
      font-family: monospace;
      font-size: 11px;
      color: #57534C;
      word-break: break-all;
      margin-top: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="kicker">PROBENRAUM-DIREKTZUGANG • QR-CODE SCANNEN</div>
    <h1>#${String(session.sessionNumber).padStart(2, "0")} ${escapeHtml(
      session.title
    )}</h1>
    <div class="meta">
      TERMIN: <strong>${escapeHtml(formattedDate)}</strong>
      ${
        session.location
          ? ` • ORT: <strong>${escapeHtml(session.location)}</strong>`
          : ""
      }
    </div>
    <div class="qr-box">
      ${svgString}
      <div class="kicker" style="margin-top:8px;color:#141311;font-weight:700;">
        KAMERA ÖFFNEN &amp; QR-CODE SCANNEN → DIREKT ZUR LIVE-PROBE &amp; PROGRAMMFOLGE
      </div>
      <div class="url-text">${escapeHtml(shareUrl)}</div>
    </div>
    <div class="kicker" style="margin-top:20px;">EINGEPLANTE STÜCKE (${
      session.pieces.length
    })</div>
    <table>
      <tbody>${piecesHtml}</tbody>
    </table>
  </div>
  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`);
    printWindow.document.close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex max-h-[94vh] w-full flex-col border-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] text-[var(--ink-primary)] ${
          fullscreenPoster ? "max-w-3xl" : "max-w-lg"
        }`}
      >
        {/* Top Modal Header */}
        <div className="flex items-center justify-between gap-2 border-b-2 border-[var(--rule-heavy)] bg-[var(--bg-recessed)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <QrCode className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
              <span className="type-kicker text-[var(--accent)]">
                PROBEN-DIREKTZUGANG • LINK & QR-CODE
              </span>
            </div>
            <h2 className="font-display mt-0.5 truncate text-lg font-semibold text-[var(--ink-primary)] sm:text-xl">
              #{String(session.sessionNumber).padStart(2, "0")} {session.title}
            </h2>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFullscreenPoster((v) => !v)}
              title={
                fullscreenPoster
                  ? "Standardansicht"
                  : "Große Probenraum-Ansicht zum Abscannen"
              }
              className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[10px] text-[var(--ink-primary)] hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)] cursor-pointer"
            >
              {fullscreenPoster ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" /> KOMPAKT
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" /> AUSHANG
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[10px] text-[var(--ink-primary)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] cursor-pointer"
            >
              SCHLIESSEN <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {/* Session Meta Summary Strip */}
          <div className="border border-[var(--rule-border)] bg-[var(--bg-paper)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-mono-tabular text-xs text-[var(--ink-secondary)]">
                TERMIN:{" "}
                <strong className="text-[var(--ink-primary)]">
                  {formattedDate}
                </strong>
                {session.location && (
                  <>
                    {" "}
                    • ORT:{" "}
                    <strong className="text-[var(--ink-primary)]">
                      {session.location}
                    </strong>
                  </>
                )}
              </div>
              <span className="font-mono-tabular border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--ink-primary)]">
                {session.pieces.length} STÜCKE
              </span>
            </div>
            {session.additionalInfo && (
              <div className="mt-2 border-l-2 border-[var(--accent)] pl-2.5 text-xs text-[var(--ink-secondary)]">
                {session.additionalInfo}
              </div>
            )}
          </div>

          {/* Scannable Vector QR Code Display */}
          <div className="flex flex-col items-center border-2 border-[var(--ink-primary)] bg-[var(--bg-surface)] p-4 sm:p-6">
            {qrData ? (
              <div
                className={`w-full ${
                  fullscreenPoster ? "max-w-[380px]" : "max-w-[240px]"
                } aspect-square border border-[var(--rule-border)] bg-[#FDFBF7] p-2`}
              >
                <svg
                  viewBox={`0 0 ${qrData.totalModules} ${qrData.totalModules}`}
                  shapeRendering="crispEdges"
                  className="h-full w-full"
                  role="img"
                  aria-label={`QR-Code für ${session.title}`}
                >
                  <rect width="100%" height="100%" fill="#FDFBF7" />
                  <path d={qrData.pathData} fill="#141311" />
                </svg>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-[var(--ink-muted)]">
                QR-Code wird generiert...
              </div>
            )}

            <div className="mt-3 text-center">
              <div className="type-kicker font-bold text-[var(--ink-primary)]">
                MIT SMARTPHONE-KAMERA SCANNEN → DIREKT ZUR SESSION
              </div>
              <p className="mt-1 text-xs text-[var(--ink-secondary)]">
                Öffnet automatisch den Probeplan und wählt direkt{" "}
                <strong>
                  #{String(session.sessionNumber).padStart(2, "0")}{" "}
                  {session.title}
                </strong>{" "}
                inkl. Programmfolge und Proben-Log aus.
              </p>
            </div>
          </div>

          {/* Direct Link Input & Primary Copy / Share Actions */}
          <div className="space-y-2">
            <label className="type-kicker block text-[var(--ink-secondary)]">
              DIREKT-LINK ZU DIESER PROBE
            </label>
            <div className="flex items-stretch gap-1.5">
              <input
                type="text"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono-tabular flex-1 border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={`type-kicker ui-transition inline-flex shrink-0 items-center gap-1.5 border px-3.5 py-2 text-xs font-bold cursor-pointer ${
                  copied
                    ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                    : "border-[var(--ink-primary)] bg-[var(--bg-recessed)] text-[var(--ink-primary)] hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)]"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    LINK KOPIERT!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    KOPIEREN
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3">
              <button
                type="button"
                onClick={handleNativeShare}
                className="type-kicker ui-transition inline-flex items-center justify-center gap-1.5 bg-[var(--accent)] px-3 py-2.5 text-xs font-bold text-[var(--accent-ink)] cursor-pointer"
              >
                <Share2 className="h-3.5 w-3.5" />
                {sharedFeedback ? "BEREIT ZUM TEILEN!" : "LINK TEILEN"}
              </button>

              <button
                type="button"
                onClick={handleDownloadSvg}
                className="type-kicker ui-transition inline-flex items-center justify-center gap-1.5 border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-2.5 text-xs text-[var(--ink-primary)] hover:bg-[var(--bg-recessed)] cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                QR ALS SVG
              </button>

              <button
                type="button"
                onClick={handlePrintPoster}
                className="type-kicker ui-transition inline-flex items-center justify-center gap-1.5 border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-2.5 text-xs text-[var(--ink-primary)] hover:bg-[var(--bg-recessed)] cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
                AUSHANG DRUCKEN
              </button>
            </div>
          </div>

          {/* Compact Program Preview inside QR Modal */}
          {session.pieces.length > 0 && (
            <div className="border-t border-[var(--rule-border)] pt-3">
              <div className="type-kicker mb-1.5 text-[var(--ink-muted)]">
                PROGRAMMFOLGE DIESER PROBE ({session.pieces.length} STÜCKE)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {session.pieces.map((sp, i) => (
                  <span
                    key={sp.id}
                    className="border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2 py-0.5 text-xs text-[var(--ink-primary)]"
                  >
                    <strong className="font-mono-tabular">
                      {String(i + 1).padStart(2, "0")}.
                    </strong>{" "}
                    {sp.piece.title}
                    {sp.piece.folderNumber ? ` (#${sp.piece.folderNumber})` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
