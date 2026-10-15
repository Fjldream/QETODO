export function CalendarPage() {
  return (
    <section className="page">
      <header className="large-title-header">
        <p className="eyebrow">按日期查看</p>
        <h1>日历</h1>
      </header>
      <div className="empty-state">
        <span className="empty-state-symbol">15</span>
        <h2>暂无到期任务</h2>
        <p>设置截止时间后，任务会按天汇总在这里。</p>
      </div>
    </section>
  );
}
