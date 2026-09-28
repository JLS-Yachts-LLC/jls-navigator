/**
 * The map: the same system rows, laid out and cabled together.
 *
 * Nodes are derived straight from the systems passed in rather than kept in
 * their own React Flow state — a position change writes through the parent, so
 * the register and the map can never drift apart. Zones are plain background
 * frames (deck, tech space, AV rack room) rather than React Flow parents,
 * because parenting would drag every system inside a frame along with it and
 * that is rarely what you want on a vessel drawing.
 */
import { Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  NodeResizer,
  useReactFlow,
  getNodesBounds,
  getViewportForBounds,
  type Node,
  type Edge,
  type NodeProps,
  type NodeChange,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  DISCIPLINES, LINK_TYPES, disciplineMeta, statusMeta, linkMeta, tierPositions, dattoPresence,
  type YachtSystem, type YachtZone, type YachtLink, type LinkType, type DattoDevice,
} from "@/components/yacht-network/taxonomy";
import { AlignJustify, Printer, Plus, Trash2, Square, GitBranch } from "lucide-react";

const NODE_WIDTH = 200;
const PRINT_W = 1122; // A4 landscape at 96dpi
const PRINT_H = 794;

/**
 * Node height varies with how much detail a system carries, and the real
 * measured height isn't known when edges are computed. This only decides which
 * face an edge leaves from, and that choice is stable unless two nodes sit
 * almost exactly level — so an estimate is enough.
 */
const EST_NODE_HEIGHT = 92;

const HANDLE_STYLE: CSSProperties = { width: 7, height: 7, border: "none" };

const SIDES = [
  { position: Position.Top,    sourceId: "s-top",    targetId: "t-top" },
  { position: Position.Right,  sourceId: "s-right",  targetId: "t-right" },
  { position: Position.Bottom, sourceId: "s-bottom", targetId: "t-bottom" },
  { position: Position.Left,   sourceId: "s-left",   targetId: "t-left" },
] as const;

/**
 * Pick the pair of faces that makes a link read as a straight run rather than
 * a loop back on itself: the side of each node that points at the other.
 *
 * Vertical wins ties, because a yacht drawing is read top-down — WAN at the
 * deckhead, endpoints below — so a link between two roughly-level nodes still
 * looks like flow rather than a sideways hop.
 */
function handlesFor(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy >= 0
      ? { sourceHandle: "s-bottom", targetHandle: "t-top" }
      : { sourceHandle: "s-top", targetHandle: "t-bottom" };
  }
  return dx >= 0
    ? { sourceHandle: "s-right", targetHandle: "t-left" }
    : { sourceHandle: "s-left", targetHandle: "t-right" };
}

export interface YachtCanvasProps {
  systems: YachtSystem[];
  zones: YachtZone[];
  links: YachtLink[];
  selectedId: string | null;
  vesselName: string;
  dattoByUid: Map<string, DattoDevice>;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onAddLink: (from: string, to: string, linkType: LinkType) => void;
  onDeleteLink: (id: string) => void;
  onSaveLayout: (positions: Array<{ id: string; x: number; y: number }>) => void;
  onAddZone?: () => void;
  onUpdateZone?: (id: string, patch: Partial<YachtZone>) => void;
  onDeleteZone?: (id: string) => void;
  /** Uplinks recorded in the register with no cable drawn for them yet. */
  missingUplinkCount?: number;
  onDrawUplinks?: () => void;
  /** View-only access: pan, zoom, select and print, but change nothing. */
  readOnly?: boolean;
}

export function YachtCanvas(props: YachtCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

// ─── Nodes ────────────────────────────────────────────────────────────────────

function SystemNode({ data, selected }: NodeProps) {
  const system = data.system as YachtSystem;
  const datto = (data.datto ?? null) as DattoDevice | null;
  const meta = disciplineMeta(system.discipline);
  const status = statusMeta(system.status);
  const Icon = meta.icon;

  return (
    <div
      style={{ width: NODE_WIDTH, borderColor: selected ? meta.colour : undefined }}
      className={`rounded-lg border bg-card shadow-sm ${
        selected ? "ring-2 ring-offset-1 ring-offset-background" : "border-border"
      }`}
    >
      {/* A handle on every side, each doubling as source and target, so an
          edge can leave whichever face actually points at its neighbour. The
          target sits under the source at the same spot: dropping a connection
          hits either, dragging one out always grabs the source. */}
      {SIDES.map(({ position, sourceId, targetId }) => (
        <Fragment key={position}>
          <Handle
            id={targetId}
            type="target"
            position={position}
            style={{ ...HANDLE_STYLE, background: meta.colour }}
          />
          <Handle
            id={sourceId}
            type="source"
            position={position}
            style={{ ...HANDLE_STYLE, background: meta.colour }}
          />
        </Fragment>
      ))}
      <div className="flex items-center gap-1.5 rounded-t-lg px-2 py-1" style={{ background: `${meta.colour}22` }}>
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: meta.colour }} />
        <span className="text-[10px] uppercase tracking-wide truncate" style={{ color: meta.colour }}>
          {meta.label}
        </span>
        <span
          className="ml-auto h-2 w-2 rounded-full shrink-0"
          style={{ background: status.colour }}
          title={status.label}
        />
      </div>
      <div className="px-2 py-1.5">
        <p className="text-xs font-medium leading-tight break-words">{system.name}</p>
        {(system.manufacturer || system.model) && (
          <p className="text-[10px] text-muted-foreground truncate">
            {[system.manufacturer, system.model].filter(Boolean).join(" ")}
          </p>
        )}
        {system.ip_address && (
          <p className="text-[10px] font-mono text-muted-foreground truncate">{system.ip_address}</p>
        )}
        {(system.deck || system.rack_location) && (
          <p className="text-[10px] text-muted-foreground/70 truncate">
            {[system.deck, system.rack_location].filter(Boolean).join(" · ")}
          </p>
        )}
        {datto && (() => {
          const presence = dattoPresence(datto);
          return (
            <p
              className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground truncate"
              title={`Datto: ${datto.hostname ?? datto.datto_uid} · ${presence.label}${datto.last_seen_at ? ` · last seen ${new Date(datto.last_seen_at).toLocaleString()}` : ""}`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: presence.colour }}
              />
              <span className="truncate">{presence.label} · Datto</span>
            </p>
          );
        })()}
      </div>
    </div>
  );
}

function ZoneNode({ data, selected }: NodeProps) {
  const zone = data.zone as YachtZone;
  const colour = zone.colour ?? "#64748b";
  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={220}
        minHeight={160}
        lineStyle={{ borderColor: colour }}
        handleStyle={{ background: colour }}
      />
      <div
        style={{ width: "100%", height: "100%", borderColor: colour, background: `${colour}12` }}
        className="rounded-xl border-2 border-dashed"
      >
        <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: colour }}>
          {zone.name}
          {zone.deck ? <span className="opacity-60"> · {zone.deck}</span> : null}
        </div>
      </div>
    </>
  );
}

const NODE_TYPES = { yachtSystem: SystemNode, yachtZone: ZoneNode };

// ─── Canvas ───────────────────────────────────────────────────────────────────

function Canvas({
  systems, zones, links, selectedId, vesselName, dattoByUid,
  onSelect, onMove, onAddLink, onDeleteLink, onSaveLayout,
  onAddZone, onUpdateZone, onDeleteZone, missingUplinkCount = 0, onDrawUplinks,
  readOnly = false,
}: YachtCanvasProps) {
  const reactFlow = useReactFlow();
  const [drawType, setDrawType] = useState<LinkType>("ethernet");
  // Zone selection is ours to track: the node list is derived from props, so
  // React Flow's own selection state never survives a re-render.
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  const visible = useMemo(() => systems.filter((s) => s.on_canvas), [systems]);

  const nodes = useMemo<Node[]>(() => [
    ...zones.map((z) => ({
      id: `zone:${z.id}`,
      type: "yachtZone",
      position: { x: z.position_x, y: z.position_y },
      data: { zone: z },
      // The frame's size lives on the node so NodeResizer's handles track it.
      style: { width: z.width, height: z.height },
      // Behind the systems, and never a connection target. Not selectable when
      // view-only, since selecting a zone is what shows its resize handles.
      zIndex: -1,
      selectable: !readOnly,
      connectable: false,
      // Delete/Backspace removes cabling only — a register row is never lost
      // to a stray keypress on the drawing.
      deletable: false,
      selected: z.id === selectedZoneId,
    })),
    ...visible.map((s) => ({
      id: s.id,
      type: "yachtSystem",
      position: { x: s.position_x, y: s.position_y },
      data: { system: s, datto: s.datto_uid ? dattoByUid.get(s.datto_uid) ?? null : null },
      deletable: false,
      selected: s.id === selectedId,
    })),
  ], [zones, visible, selectedId, selectedZoneId, dattoByUid, readOnly]);

  const edges = useMemo<Edge[]>(() => {
    const centre = new Map(visible.map((s) => [s.id, {
      x: s.position_x + NODE_WIDTH / 2,
      y: s.position_y + EST_NODE_HEIGHT / 2,
    }]));

    return links
      // A link to a system that's been hidden from the map has nothing to draw between.
      .filter((l) => centre.has(l.from_system_id) && centre.has(l.to_system_id))
      .map((l) => {
        const meta = linkMeta(l.link_type);
        const { sourceHandle, targetHandle } = handlesFor(
          centre.get(l.from_system_id)!,
          centre.get(l.to_system_id)!,
        );
        return {
          id: l.id,
          source: l.from_system_id,
          target: l.to_system_id,
          sourceHandle,
          targetHandle,
          label: l.label ?? undefined,
          style: { stroke: meta.colour, strokeWidth: 1.8, strokeDasharray: meta.dash },
          markerEnd: { type: MarkerType.ArrowClosed, color: meta.colour, width: 14, height: 14 },
        } as Edge;
      });
  }, [links, visible]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        if (change.id.startsWith("zone:")) {
          onUpdateZone?.(change.id.slice(5), {
            position_x: change.position.x,
            position_y: change.position.y,
          });
        } else {
          onMove(change.id, change.position.x, change.position.y);
        }
      } else if (change.type === "dimensions" && change.dimensions && change.id.startsWith("zone:")) {
        onUpdateZone?.(change.id.slice(5), {
          width: change.dimensions.width,
          height: change.dimensions.height,
        });
      } else if (change.type === "select") {
        if (change.id.startsWith("zone:")) {
          setSelectedZoneId(change.selected ? change.id.slice(5) : null);
        } else if (change.selected) {
          onSelect(change.id);
          setSelectedZoneId(null);
        }
      }
    }
  }, [onMove, onSelect, onUpdateZone]);

  const onConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target) {
      onAddLink(connection.source, connection.target, drawType);
    }
  }, [onAddLink, drawType]);

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    deleted.forEach((e) => onDeleteLink(e.id));
  }, [onDeleteLink]);

  const autoLayout = useCallback(() => {
    const positions = tierPositions(visible);
    onSaveLayout(visible.map((s, i) => ({ id: s.id, x: positions[i].x, y: positions[i].y })));
    setTimeout(() => reactFlow.fitView({ padding: 0.2, duration: 400 }), 60);
  }, [visible, onSaveLayout, reactFlow]);

  // Print: size the viewport to an A4 landscape page first, so "Actual Size" in
  // the browser's print dialog and "Fit to Page" come out the same.
  const print = useCallback(() => {
    const bounds = getNodesBounds(nodes);
    const viewport = getViewportForBounds(bounds, PRINT_W, PRINT_H, 0.1, 3, 0.05);
    reactFlow.setViewport(viewport, { duration: 0 });
    setTimeout(() => {
      document.body.classList.add("yn-printing-map");
      window.print();
    }, 350);
  }, [nodes, reactFlow]);

  useEffect(() => {
    const after = () => {
      document.body.classList.remove("yn-printing-map");
      reactFlow.fitView({ padding: 0.2, duration: 200 });
    };
    window.addEventListener("afterprint", after);
    return () => window.removeEventListener("afterprint", after);
  }, [reactFlow]);

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 flex-wrap px-4 py-2 border-b border-border bg-card/60 text-xs">
        {readOnly ? (
          <span className="text-muted-foreground/60">View only — you can pan, zoom and print this map, but not change it.</span>
        ) : (
          <>
            <label className="inline-flex items-center gap-1.5">
              <span className="text-muted-foreground">New links are</span>
              <select
                value={drawType}
                onChange={(e) => setDrawType(e.target.value as LinkType)}
                className="rounded-md border border-border bg-background px-2 py-1"
              >
                {LINK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>

            <span className="text-muted-foreground/60">Drag from any edge of a node to its neighbour to cable it.</span>
          </>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {!readOnly && missingUplinkCount > 0 && onDrawUplinks && (
            <button
              onClick={onDrawUplinks}
              title="Draw a cable for every uplink recorded in the register that has none"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-primary/40 text-primary hover:bg-primary/10"
            >
              <GitBranch className="h-3.5 w-3.5" /> Draw {missingUplinkCount} uplink{missingUplinkCount === 1 ? "" : "s"}
            </button>
          )}
          {!readOnly && onAddZone && (
            <button onClick={onAddZone} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border hover:bg-muted">
              <Square className="h-3.5 w-3.5" /> Add zone
            </button>
          )}
          {!readOnly && selectedZoneId && onDeleteZone && (
            <button
              onClick={() => { onDeleteZone(selectedZoneId); setSelectedZoneId(null); }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete zone
            </button>
          )}
          {!readOnly && (
            <button onClick={autoLayout} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border hover:bg-muted">
              <AlignJustify className="h-3.5 w-3.5" /> Auto-layout
            </button>
          )}
          <button onClick={print} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border hover:bg-muted">
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 relative yn-map-canvas">
        {visible.length === 0 ? (
          <div className="h-full grid place-items-center text-center p-10">
            <div>
              <Plus className="h-7 w-7 mx-auto text-muted-foreground/40" />
              <p className="mt-2 text-sm font-medium">Nothing to map yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add systems on the Register tab — they appear here automatically.
              </p>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onConnect={onConnect}
            onEdgesDelete={onEdgesDelete}
            onPaneClick={() => { onSelect(null); setSelectedZoneId(null); }}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            // Backspace/Delete removes cabling; nothing may be removed view-only.
            deleteKeyCode={readOnly ? null : undefined}
            fitView
            minZoom={0.1}
            maxZoom={3}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) =>
                n.type === "yachtZone"
                  ? "#33415533"
                  : disciplineMeta((n.data as any)?.system?.discipline).colour
              }
            />
          </ReactFlow>
        )}

        {/* Legend — printed with the drawing, so a paper copy still decodes */}
        <div className="yn-map-legend absolute bottom-3 left-3 rounded-lg border border-border bg-card/95 px-3 py-2 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{vesselName}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 max-w-[520px]">
            {LINK_TYPES.map((t) => (
              <span key={t.key} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-0.5 w-4" style={{ background: t.colour }} /> {t.label}
              </span>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 max-w-[520px]">
            {DISCIPLINES.filter((d) => visible.some((s) => s.discipline === d.key)).map((d) => (
              <span key={d.key} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: d.colour }} /> {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Print rules: hide the app, show the canvas at exactly one A4 landscape page. */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body.yn-printing-map * { visibility: hidden !important; }
          body.yn-printing-map .yn-map-canvas,
          body.yn-printing-map .yn-map-canvas * { visibility: visible !important; }
          body.yn-printing-map .yn-map-canvas {
            position: fixed !important;
            inset: 0 !important;
            width: 297mm !important;
            height: 210mm !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body.yn-printing-map .react-flow__minimap,
          body.yn-printing-map .react-flow__controls,
          body.yn-printing-map .react-flow__background,
          body.yn-printing-map .react-flow__attribution {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
