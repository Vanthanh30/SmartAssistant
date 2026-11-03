export async function deleteStudySession(id, version, write, read) {
  try {
    const result = await write(`/lich-hoc/${id}`, { version }, "DELETE");
    if (result?.deleted !== true)
      throw new Error("Máy chủ chưa xác nhận xóa buổi học thành công.");
    return result;
  } catch (error) {
    if (error.status !== 404) throw error;
    try {
      await read(`/lich-hoc/${id}`);
    } catch (check) {
      if (
        check.status === 404 &&
        check.message !== "Không tìm thấy trang hoặc tài nguyên."
      )
        return { id, deleted: true };
      throw error;
    }
    throw new Error(
      "Backend đang chạy chưa nạp API xóa buổi học. Dừng BE hiện tại bằng Ctrl+C rồi chạy lại npm run dev trong thư mục BE, sau đó thử xóa lại.",
      { cause: error },
    );
  }
}
