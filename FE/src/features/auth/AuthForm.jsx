import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { login, register, logout } from "./api.js";
import { loginSchema, registerSchema } from "./schemas.js";
import { sessionKey, useAuth } from "./useAuth.js";
import { StatusPanel } from "../../components/StatusPanel.jsx";
import { Brand } from '../../components/Brand.jsx';
import { BookOpen, Sparkles, Layers, Eye, EyeOff } from 'lucide-react';
const homeForRole = (role) =>
  role === "admin" ? "/admin/dashboard" : "/app/courses";
export function AuthForm({ mode }) {
  const isRegister = mode === "register";
  const isAdmin = mode === "admin";
  const [visible, setVisible] = useState(false);
  const auth = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const submitting = useRef(false);
  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(isRegister ? registerSchema : loginSchema),
    defaultValues: {
      email: "",
      password: "",
      ...(isRegister ? { fullName: "", confirmPassword: "" } : {}),
    },
  });
  const mutation = useMutation({
    mutationFn: async input => {
      const data = await (isRegister ? register(input) : login(input));
      if (isAdmin && data.user.role !== 'admin') {
        await logout(data.csrfToken);
        client.setQueryData(sessionKey, null);
        throw new Error('Tài khoản này không có quyền quản trị. Vui lòng dùng trang đăng nhập sinh viên.');
      }
      return data;
    },
    onSuccess: (data) => {
      client.setQueryData(sessionKey, data);
      navigate(homeForRole(data.user.role), { replace: true });
    },
    onError: (error) => {
      for (const [name, message] of Object.entries(error.fields ?? {}))
        setError(name, { type: "server", message });
    },
  });
  if (auth.isPending) return <StatusPanel title="Đang kiểm tra phiên…" />;
  if (auth.data?.user)
    return <Navigate to={homeForRole(auth.data.user.role)} replace />;
  const inputs = [
    ...(isRegister
      ? [
        {
          name: "fullName",
          label: "Họ tên",
          autoComplete: "name",
          type: "text",
        },
      ]
      : []),
    { name: "email", label: "Email", autoComplete: "email", type: "email" },
    {
      name: "password",
      label: "Mật khẩu",
      autoComplete: isRegister ? "new-password" : "current-password",
      type: visible ? "text" : "password",
    },
    ...(isRegister
      ? [
        {
          name: "confirmPassword",
          label: "Xác nhận mật khẩu",
          autoComplete: "new-password",
          type: visible ? "text" : "password",
        },
      ]
      : []),
  ];
  const submit = async (input) => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      await mutation.mutateAsync(input);
    } catch {
      /* Error rendered by mutation state. */
    } finally {
      submitting.current = false;
    }
  };
  return (
    <div className="auth-layout"><aside className="auth-story"><Brand/><div><span className="eyebrow">{isAdmin?'CỔNG QUẢN TRỊ':'KHÔNG GIAN HỌC THÔNG MINH'}</span><h2>{isAdmin?<>Quản lý hệ thống.<br/><span>Đồng hành cùng người học.</span></>:<>Từ tài liệu của bạn.<br/><span>Đến kiến thức của bạn.</span></>}</h2><p>{isAdmin?'Truy cập khu vực quản lý người dùng và tài liệu bằng tài khoản quản trị đã được cấp.':'Một nơi để tổ chức nguồn học, đặt câu hỏi và ôn tập với AI.'}</p>{!isAdmin&&<ul><li><BookOpen size={22}/>Tập hợp PDF theo từng môn học</li><li><Sparkles size={22}/>Hỏi đáp và đối chiếu nguồn trích dẫn</li><li><Layers size={22}/>Ôn tập bằng quiz và flashcard</li></ul>}</div><p className="hint">Học có căn cứ. Luôn kiểm tra lại nguồn tài liệu.</p></aside><section className="auth-card">
      <div className="auth-mobile-brand"><Brand/></div>
      <span className="eyebrow">{isAdmin?'DÀNH CHO QUẢN TRỊ VIÊN':isRegister ? 'BẮT ĐẦU HÀNH TRÌNH' : 'CHÀO MỪNG TRỞ LẠI'}</span>
      <h1>{isAdmin?"Đăng nhập quản trị":isRegister ? "Tạo tài khoản" : "Đăng nhập"}</h1>
      <p>
        {isRegister
          ? "Bắt đầu với tài khoản sinh viên của bạn."
          : isAdmin?"Sử dụng tài khoản có quyền admin để tiếp tục.":"Tiếp tục học từ tài liệu của bạn."}
      </p>
      {auth.isError && <p role="alert">{auth.error.message}</p>}
      <form
        onSubmit={(event) => {
          void handleSubmit(submit)(event);
        }}
        noValidate
      >
        {inputs.map((input) => (
          <div className="field" key={input.name}>
            <label htmlFor={input.name}>{input.label}</label>
            <input
              id={input.name}
              type={input.type}
              autoComplete={input.autoComplete}
              {...field(input.name)}
              aria-invalid={!!errors[input.name]}
              aria-describedby={
                errors[input.name] ? `${input.name}-error` : undefined
              }
            />
            {errors[input.name] && (
              <p
                id={`${input.name}-error`}
                className="field-error"
                role="alert"
              >
                {errors[input.name].message}
              </p>
            )}
          </div>
        ))}
        <button
          className="text-button"
          type="button"
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={16} aria-hidden="true"/> : <Eye size={16} aria-hidden="true"/>}{visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        </button>
        {isRegister && (
          <p className="hint">
            Mật khẩu từ 8–72 byte UTF-8; ký tự có dấu có thể dùng nhiều byte.
          </p>
        )}
        {mutation.isError && (
          <p className="field-error" role="alert">
            {mutation.error.message}
          </p>
        )}
        <button
          className="primary full"
          disabled={mutation.isPending}
          type="submit"
        >
          {mutation.isPending
            ? "Đang xử lý…"
            : isRegister
              ? "Đăng ký"
              : "Đăng nhập"}
        </button>
      </form>
      {isAdmin?<p><Link to="/login">← Đăng nhập sinh viên</Link></p>:<p>
        {isRegister ? "Đã có tài khoản? " : "Chưa có tài khoản? "}
        <Link to={isRegister ? "/login" : "/register"}>
          {isRegister ? "Đăng nhập" : "Đăng ký"}
        </Link>
      </p>}
      {!isAdmin&&!isRegister&&<p><Link to="/admin/login">Đăng nhập dành cho quản trị viên</Link></p>}
    </section></div>
  );
}
