import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";
import { Button } from "../../components/ui/Button.jsx";
import { useAuth } from "../auth/useAuth.js";
export function StoredFormulaImage({ block, onOpen, citation }) {
  const renderedImage = useRef(null);
  const { data: auth } = useAuth();
  const image = useQuery({
    queryKey: ["stored-formula", auth?.user.id, block.imagePath],
    enabled: !!auth,
    queryFn: async ({ signal }) =>
      (await api(block.imagePath, { raw: true, signal })).blob(),
    staleTime: 60000,
    gcTime: 120000,
    retry: (count, error) =>
      count < 2 &&
      (!error.status || [429, 502, 503, 504].includes(error.status)),
  });
  useEffect(() => {
    if (!image.data || !renderedImage.current) return;
    const objectUrl = URL.createObjectURL(image.data);
    renderedImage.current.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [image.data]);
  if (image.isError)
    return (
      <p role="status">
        Chưa tải được ảnh công thức.{" "}
        <Button onClick={() => image.refetch()}>Thử lại</Button>
      </p>
    );
  return (
    <figure className="answer-formula">
      {image.data ? (
        <img
          ref={renderedImage}
          alt="Công thức từ tài liệu gốc"
          style={{ display: "block", maxWidth: "100%", height: "auto" }}
          onClick={() => onOpen?.(citation)}
        />
      ) : (
        <p>Đang tải công thức…</p>
      )}
      {image.data && <figcaption>Công thức gốc{block.source?.pageFrom ? ` · Trang ${block.source.pageFrom}` : ''}{onOpen && citation && <Button onClick={() => onOpen(citation)}>Xem trang gốc</Button>}</figcaption>}
    </figure>
  );
}
