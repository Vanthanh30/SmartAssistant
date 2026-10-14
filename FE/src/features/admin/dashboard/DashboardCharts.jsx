import { number,labels } from './format.js';
export function DailyChart({title,data}){const max=Math.max(1,...data.map(x=>x.count));return <article className="dashboard-card">
    <h2>{title}</h2>{data.every(x=>x.count===0)&&<p className="hint">Chưa có hoạt động trong khoảng ngày này.</p>}<svg className="dashboard-chart" viewBox="0 0 600 180" role="img" aria-label={`${title}: ${data.reduce((n,x)=>n+x.count,0)} lượt trong ${data.length} ngày`}>
    <line x1="0" y1="170" x2="600" y2="170" stroke="#E5EAF2"/>{data.map((row,i)=>{const h=row.count/max*155;return <rect key={row.day} x={i*600/data.length+1} y={170-h} width={Math.max(1,600/data.length-2)} height={h} rx="2" fill="#6B9DFF">
    <title>{row.day}: {row.count}</title>
    </rect>;})}</svg>
    <div className="dashboard-axis">
    <span>{data[0]?.day}</span>
    <span>{data.at(-1)?.day}</span>
    </div>
    <details>
    <summary>Xem số liệu từng ngày</summary>
    <div className="dashboard-table-scroll">
    <table>
    <thead>
    <tr>
    <th>Ngày Việt Nam</th>
    <th>Số lượt</th>
    </tr>
    </thead>
    <tbody>{data.map(row=>
    <tr key={row.day}>
    <td>{row.day}</td>
    <td>{number(row.count)}</td>
    </tr>)}</tbody>
    </table>
    </div>
    </details>
    </article>;}
export function DocumentDistribution({ data }) {
  return (
    <article className="dashboard-card">
    <h2>Trạng thái PDF · hiện tại</h2>{!data.charts.documentStates.length?<p>Chưa có tài liệu đang sử dụng.</p>:data.charts.documentStates.map(row=>
    <div className="dashboard-distribution" key={row.status}>
    <span>{labels[row.status]??row.status}</span>
    <meter min="0" max={Math.max(1,data.totals.documents.total)} value={row.count} aria-label={labels[row.status]??row.status}/>
    <strong>{number(row.count)}</strong>
    </div>)}</article>
  );
}
export function DashboardConfiguration({ data }) {
  return (
    <article className="dashboard-card">
    <h2>Cấu hình được ghi nhận</h2>
    <dl>
    <dt>LLM API</dt>
    <dd>{data.configuration.llmModel??'Chưa cấu hình'} ({data.configuration.llmProvider})</dd>
    <dt>Embedding trong index</dt>
    <dd>{data.configuration.embedding.length?data.configuration.embedding.map(x=>
    <span className="dashboard-model" key={x.model+x.revision}>{x.model} · {x.dimension} chiều · {x.metric}<small>Revision {x.revision}</small>
    </span>):'Chưa có dữ liệu'}</dd>
    <dt>RAG</dt>
    <dd>Top-k cấu hình: {data.configuration.ragTopK} · ngưỡng {data.configuration.ragScoreThreshold} · chat truy hồi {data.configuration.retrievalCandidates} ứng viên</dd>
    </dl>
    <p className="hint">Thông tin cấu hình, không phải trạng thái health. Chưa có trang chỉnh cấu hình.</p>
    </article>
  );
}
