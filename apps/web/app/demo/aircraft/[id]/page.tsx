import Link from "next/link";
import { ArrowLeft, Plane, AlertTriangle, FileText, Wrench } from "lucide-react";
import { demoAircraft, demoSquawks, demoLogbookEntries, demoWorkOrders } from "../../_lib/mockData";

export const metadata = { title: "Aircraft · Demo" };

export default function DemoAircraftDetailPage({ params }: { params: { id: string } }) {
  const ac =
    demoAircraft.find((a) => a.id === params.id) ??
    demoAircraft.find((a) => a.tail_number.toLowerCase() === params.id.toLowerCase()) ??
    demoAircraft[0];
  const squawks = demoSquawks.filter((s) => s.aircraft_id === ac.id);
  const workOrders = demoWorkOrders.filter((w) => w.aircraft_id === ac.id);
  const logbook = demoLogbookEntries.filter((l) => l.aircraft_id === ac.id);

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <Link
          href="/demo/aircraft"
          className="inline-flex items-center gap-1.5 text-[13px] text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to fleet
        </Link>

        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Plane className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-[26px] text-slate-900" style={{ fontWeight: 700 }}>
                {ac.tail_number}
              </h1>
              <p className="text-slate-600 text-[14px]">
                {ac.year} {ac.make} {ac.model} · S/N {ac.serial_number}
              </p>
            </div>
          </div>
          <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
            {ac.registration_status}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <Stat label="Total Time" value={`${ac.total_time.toLocaleString()} hrs`} />
          <Stat label="Engine Time" value={`${ac.engine_time.toLocaleString()} hrs`} />
          <Stat label="Last Annual" value={ac.last_annual} />
          <Stat label="Annual Due" value={ac.annual_due} accent />
        </div>

        <Section icon={AlertTriangle} title="Open squawks" count={squawks.length} accent="text-amber-700 bg-amber-50">
          {squawks.length === 0 ? (
            <Empty text="No open squawks. Nice." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {squawks.map((s) => (
                <li key={s.id} className="py-2.5">
                  <p className="text-[14px] text-slate-900" style={{ fontWeight: 600 }}>
                    {s.title}
                  </p>
                  <p className="text-[12px] text-slate-600 mt-0.5">{s.description}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={Wrench} title="Active work orders" count={workOrders.length} accent="text-blue-700 bg-blue-50">
          {workOrders.length === 0 ? (
            <Empty text="No active work orders." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {workOrders.map((w) => (
                <li key={w.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[14px] text-slate-900" style={{ fontWeight: 600 }}>
                      {w.number} — {w.title}
                    </p>
                    <p className="text-[12px] text-slate-600 mt-0.5">Status: {w.status}</p>
                  </div>
                  <span className="text-[13px] text-slate-700" style={{ fontWeight: 600 }}>
                    ${w.estimated_total.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={FileText} title="Recent logbook entries" count={logbook.length} accent="text-violet-700 bg-violet-50">
          {logbook.length === 0 ? (
            <Empty text="No logbook entries yet." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {logbook.map((l) => (
                <li key={l.id} className="py-2.5">
                  <p className="text-[14px] text-slate-900" style={{ fontWeight: 600 }}>
                    {l.summary}
                  </p>
                  <p className="text-[12px] text-slate-600 mt-0.5">
                    {l.technician_name} — {new Date(l.created_at).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 mt-6">
          <p className="text-[14px] text-slate-900 mb-3" style={{ fontWeight: 600 }}>
            Like what you see? Sign up free to add your own aircraft and pull live FAA data.
          </p>
          <Link
            href="/signup?preview=1"
            className="inline-block rounded-full bg-blue-600 text-white px-4 py-2 text-[13px] font-semibold hover:bg-blue-700 transition-colors"
          >
            Start free 30-day trial
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border ${accent ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"} p-3`}>
      <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-1" style={{ fontWeight: 600 }}>
        {label}
      </p>
      <p className={`text-[16px] ${accent ? "text-amber-900" : "text-slate-900"}`} style={{ fontWeight: 700 }}>
        {value}
      </p>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  accent,
  children,
}: {
  icon: any;
  title: string;
  count: number;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-lg ${accent} flex items-center justify-center`}>
          <Icon className="w-4 h-4" />
        </div>
        <h2 className="text-[15px] text-slate-900" style={{ fontWeight: 700 }}>
          {title}
        </h2>
        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-[13px] text-slate-500 italic">{text}</p>;
}
