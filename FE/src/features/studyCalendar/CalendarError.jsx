export function CalendarError({error}) {
 if(!error)return null;
 const fields=[...new Set(Object.values(error.fields||{}))];
 return <div role="alert" className="field-error"><p>{error.message}</p>{fields.length>0&&<ul>{fields.map(text=><li key={text}>{text}</li>)}</ul>}</div>;
}
