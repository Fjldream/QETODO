export function TasksPage() {
  return (
    <section className="page">
      <header className="large-title-header">
        <p className="eyebrow">全部工作</p>
        <h1>任务</h1>
      </header>
      <div className="grouped-list">
        <div className="list-row"><span>待处理</span><strong>0</strong></div>
        <div className="list-row"><span>进行中</span><strong>0</strong></div>
        <div className="list-row"><span>等待他人</span><strong>0</strong></div>
      </div>
    </section>
  );
}
