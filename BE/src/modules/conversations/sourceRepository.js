// MySQL result tuples and parameter values are preserved at the persistence boundary.
export const sourceRepository = {
  answerPayload(db, parameters) {
    return db.execute(
      'SELECT noi_dung_tra_loi FROM luot_hoi_dap WHERE ma_luot_hoi_dap=? AND ma_hoi_thoai=?',
      parameters,
    );
  },
};
