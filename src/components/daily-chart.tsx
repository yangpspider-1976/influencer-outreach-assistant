/** Lightweight bar chart for daily outreach volume — no chart library needed. */
export function DailyChart({
  data,
}: {
  data: { date: string; sent: number; completed: number }[];
}) {
  const max = Math.max(1, ...data.map((point) => point.completed));

  return (
    <div>
      <div className="flex h-40 items-end gap-1.5">
        {data.map((point) => {
          const completedHeight = (point.completed / max) * 100;
          const sentHeight = (point.sent / max) * 100;
          return (
            <div
              key={point.date}
              className="group relative flex h-full flex-1 flex-col justify-end"
              title={`${point.date}: ${point.sent} sent, ${point.completed} outcomes`}
            >
              <div
                className="w-full rounded-t bg-brand-100"
                style={{ height: `${Math.max(completedHeight, point.completed ? 4 : 0)}%` }}
              >
                <div
                  className="w-full rounded-t bg-brand-600"
                  style={{
                    height: completedHeight ? `${(sentHeight / completedHeight) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-slate-400">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
      <div className="mt-3 flex gap-4 text-[12px] text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-brand-600" aria-hidden />
          Sent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-brand-100" aria-hidden />
          All recorded outcomes
        </span>
      </div>
    </div>
  );
}
