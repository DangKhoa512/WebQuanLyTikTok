import { useEffect, useState } from "react";
import { instagramApi } from "../services/api";
import { copyText } from "../services/clipboard";
import { toast } from "./Toast";
export default function InstagramCredentialDialog({
  accountId,
  uid,
  field,
  onClose,
}) {
  const [value, setValue] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setValue(null);
    setError("");
    instagramApi
      .getCredential(accountId, field)
      .then((r) => {
        if (active) setValue(r.data?.value || "");
      })
      .catch(() => {
        if (active)
          setError(
            "Không thể xem dữ liệu xác thực. Kiểm tra quyền hoặc thử lại.",
          );
      });
    return () => {
      active = false;
    };
  }, [accountId, field]);
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.55)",
        zIndex: 1200,
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={"Xem " + field}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 12,
          padding: 20,
          width: "min(760px,100%)",
          maxHeight: "85vh",
          overflow: "auto",
        }}
      >
        <h3>
          {field === "token" ? "Token" : "Cookies"} — {uid}
        </h3>
        {error ? (
          <p role="alert">{error}</p>
        ) : value === null ? (
          <p>Đang tải...</p>
        ) : (
          <textarea
            aria-label={"Toàn bộ " + field}
            readOnly
            value={value}
            rows={10}
            style={{
              width: "100%",
              fontFamily: "monospace",
              overflowWrap: "anywhere",
              whiteSpace: "pre-wrap",
            }}
          />
        )}
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 12,
          }}
        >
          {value !== null && !error && (
            <button
              className="btn btn-primary"
              onClick={() =>
                copyText(value)
                  .then(() => toast.success("Đã copy"))
                  .catch(() => toast.error("Không thể copy"))
              }
            >
              Copy
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </section>
    </div>
  );
}
