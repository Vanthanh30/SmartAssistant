const days=['Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy','Chủ Nhật'];
export function TimeWindows({title,values,onChange}) {
 const update=(index,patch)=>onChange(values.map((v,i)=>i===index?{...v,...patch}:v));
 return <fieldset className="study-windows"><legend>{title}</legend>{values.map((range,i)=><div className="calendar-input-row" key={i}>
  <label>Ngày<select value={range.day} onChange={e=>update(i,{day:Number(e.target.value)})}>{days.map((d,n)=><option value={n+1} key={d}>{d}</option>)}</select></label>
  <label>Từ<input type="time" required value={range.start} onChange={e=>update(i,{start:e.target.value})}/></label>
  <label>Đến<input type="time" required value={range.end} onChange={e=>update(i,{end:e.target.value})}/></label>
  <button type="button" onClick={()=>onChange(values.filter((_,n)=>n!==i))}>Xóa khoảng {i+1}</button>
 </div>)}<div className="actions"><button type="button" disabled={values.length>=42} onClick={()=>onChange([...values,{day:1,start:'19:00',end:'21:00'}])}>Thêm khoảng giờ</button>
 {values.length>0&&<button type="button" onClick={()=>onChange(days.flatMap((_,i)=>values.filter(v=>v.day===values[0].day).map(v=>({...v,day:i+1}))))}>Áp dụng khung ngày đầu cho cả tuần</button>}</div>
 <p className="hint">Có thể thêm nhiều khoảng/ngày. Giờ kết thúc trước giờ bắt đầu được tách qua nửa đêm.</p></fieldset>;
}
