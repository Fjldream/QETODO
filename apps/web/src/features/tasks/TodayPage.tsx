export function TodayPage() {
  return (
    <section className="page">
      <header className="large-title-header">
        <p className="eyebrow">10 月 15 日 · 星期四</p>
        <h1>今日</h1>
        <p className="secondary-text">先处理超期与紧急事项，再看今天到期的工作。</p>
      </header>
      <div className="empty-state">
        <span className="empty-state-symbol">✓</span>
        <h2>今天安排清楚了</h2>
        <p>创建第一条任务后，最需要关注的事项会出现在这里。</p>
      </div>
    </section>
  );
}
