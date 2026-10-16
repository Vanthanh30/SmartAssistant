// Split SQL only at top-level delimiters; preserve string literals and identifiers.
export function sqlStatements(sql) {
  const statements=[]; let current=''; let quote=null;
  for (let i=0;i<sql.length;i++) {
    const ch=sql[i], next=sql[i+1];
    if (quote) {
      current+=ch;
      if (ch==='\\' && quote!=='`' && next!==undefined) current+=sql[++i];
      else if (ch===quote) { if(next===quote) current+=sql[++i]; else quote=null; }
      continue;
    }
    if (ch==="'" || ch==='"' || ch==='`') { quote=ch; current+=ch; continue; }
    if (ch==='#' || (ch==='-' && next==='-' && /\s/.test(sql[i+2]||''))) {
      while(i<sql.length && sql[i]!=='\n') i++;
      current+='\n'; continue;
    }
    if(ch==='/' && next==='*') {
      // MySQL executable comments are SQL, not comments safe to discard.
      if(sql[i+2]==='!') throw new Error('Executable SQL comments are not supported by this migration runner');
      const end=sql.indexOf('*/',i+2);
      if(end<0) throw new Error('Unterminated SQL comment');
      i=end+1; current+=' '; continue;
    }
    if(ch===';') { if(current.trim()) statements.push(current.trim()); current=''; }
    else current+=ch;
  }
  if(quote) throw new Error('Unterminated SQL string/identifier');
  if(current.trim()) statements.push(current.trim());
  if(statements.some(statement=>/^DELIMITER\b/i.test(statement))) throw new Error('DELIMITER is not supported');
  return statements;
}
