import { DashboardStats, DashboardMetrics, AnswerOrigins } from './DashboardStats.jsx';
import { DailyChart, DocumentDistribution, DashboardConfiguration } from './DashboardCharts.jsx';
import { RecentDocuments, RecentAudit, DashboardNotes } from './DashboardTables.jsx';
import { time } from './format.js';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard,RefreshCw } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { Button } from '../../../components/ui/Button.jsx';
import { StatusPanel } from '../../../components/StatusPanel.jsx';
import { SectionHeading } from '../../../components/SectionHeading.jsx';
export function AdminDashboard(){
 const [filter,setFilter]=useState('7');
 const [start,setStart]=useState('');
 const [end,setEnd]=useState('');
 const [range,setRange]=useState({days:'7'});
 const [error,setError]=useState('');
 const query=useQuery({queryKey:['admin','dashboard',range],queryFn:({signal})=>api('/admin/dashboard?'+new URLSearchParams(range),{signal}),retry:false,staleTime:55000,refetchInterval:60000,refetchIntervalInBackground:false,refetchOnWindowFocus:true});
 function apply(event){event.preventDefault();if(filter==='custom'&&(!start||!end||start>end)){setError('Chọn ngày bắt đầu và kết thúc hợp lệ.');return;}setError('');setRange(filter==='custom'?{start,end}:{days:filter});}
 const data=query.data;
 return <section className="admin-dashboard">
    <SectionHeading icon={LayoutDashboard} eyebrow="QUẢN TRỊ HỆ THỐNG" title="Tổng quan"/>
    <p className="hint">Thẻ tổng là dữ liệu hiện tại. Bộ lọc chỉ áp dụng cho lượt hỏi đáp, chỉ số phản hồi và biểu đồ hoạt động. Ngày theo Asia/Ho_Chi_Minh; lượt hỏi chỉ tính hội thoại còn lưu. Khoảng tùy chọn tối đa 93 ngày.</p>
    <div className="dashboard-toolbar">
    <form onSubmit={apply}>
    <label>Khoảng thống kê<select value={filter} onChange={e=>{setFilter(e.target.value);if(e.target.value!=='custom'){setRange({days:e.target.value});setError('');}}}>
    <option value="7">7 ngày</option>
    <option value="30">30 ngày</option>
    <option value="custom">Khoảng ngày tùy chọn</option>
    </select>
    </label>{filter==='custom'&&<>
    <label>Từ ngày<input type="date" value={start} onChange={e=>setStart(e.target.value)} required/>
    </label>
    <label>Đến ngày<input type="date" value={end} onChange={e=>setEnd(e.target.value)} required/>
    </label>
    <Button type="submit">Áp dụng</Button>
    </>}</form>
    <Button disabled={query.isFetching} onClick={()=>query.refetch({cancelRefetch:false})}>
    <RefreshCw size={16} aria-hidden="true"/>{query.isFetching?'Đang cập nhật…':'Làm mới'}</Button>
    </div>{error&&<p role="alert">{error}</p>}{data&&<p className="hint">Cập nhật: {time(data.updatedAt)} · Hoạt động: {data.range.start} – {data.range.end}</p>}
 {query.isPending?<StatusPanel title="Đang tải thống kê…"/>:query.isError?<StatusPanel title="Không thể tải dashboard" retry={()=>query.refetch({cancelRefetch:false})}>
    <p>{query.error.message}</p>
    </StatusPanel>:<>
 <DashboardStats data={data}/>
 <DashboardMetrics data={data}/>
    <AnswerOrigins activity={data.activity}/>
 <div className="dashboard-charts">
    <DailyChart title="Lượt hỏi đáp theo ngày" data={data.charts.questions}/>
    <DailyChart title="PDF tải lên theo ngày" data={data.charts.uploads}/>
    </div>
 <div className="dashboard-charts"><DocumentDistribution data={data}/><DashboardConfiguration data={data}/></div>
 <RecentDocuments data={data}/>
 <RecentAudit data={data}/>
    <DashboardNotes data={data}/>
 </>}
 </section>;
}
