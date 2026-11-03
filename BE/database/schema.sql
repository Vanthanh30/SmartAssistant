-- ERD 16 bảng / 124 cột / 21 khóa ngoại. Chỉ khởi tạo database mới.
-- Giá trị nghiệp vụ bằng tiếng Việt; định danh kỹ thuật giữ nguyên.
SET NAMES utf8mb4;

CREATE TABLE `nguoi_dung` (
  `ma_nguoi_dung` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ho_ten` VARCHAR(150) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `mat_khau` VARCHAR(255) NOT NULL,
  `anh_dai_dien` VARCHAR(500) NULL,
  `vai_tro` ENUM('học sinh','quản trị viên') NOT NULL DEFAULT 'học sinh',
  `trang_thai` ENUM('hoạt động','bị khóa') NOT NULL DEFAULT 'hoạt động',
  `ngay_tao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ma_nguoi_dung`),
  UNIQUE KEY `duy_nhat_nguoi_dung_1` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `mon_hoc` (
  `ma_mon_hoc` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ma_nguoi_dung` BIGINT UNSIGNED NOT NULL,
  `ten_mon_hoc` VARCHAR(200) NOT NULL,
  `mo_ta` TEXT NOT NULL,
  `ngay_tao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ma_mon_hoc`),
  CONSTRAINT `khoa_mon_hoc_1` FOREIGN KEY (`ma_nguoi_dung`) REFERENCES `nguoi_dung` (`ma_nguoi_dung`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tai_lieu` (
  `ma_tai_lieu` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ma_mon_hoc` BIGINT UNSIGNED NOT NULL,
  `ten_tai_lieu` VARCHAR(255) NOT NULL,
  `dinh_danh_dam_may` VARCHAR(500) NULL,
  `ma_bam_tap_tin` CHAR(64) NOT NULL,
  `so_trang` INT UNSIGNED NULL,
  `cau_hinh_xu_ly` JSON NOT NULL,
  `trang_thai` VARCHAR(30) NOT NULL DEFAULT 'đã tải lên',
  `noi_dung_tom_tat` LONGTEXT NULL,
  `ngay_tai_len` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ngay_xu_ly` DATETIME NULL,
  `ngay_xoa` DATETIME NULL,
  PRIMARY KEY (`ma_tai_lieu`),
  KEY `chi_muc_tai_lieu_1` (`ma_mon_hoc`,`ma_bam_tap_tin`),
  CONSTRAINT `khoa_tai_lieu_1` FOREIGN KEY (`ma_mon_hoc`) REFERENCES `mon_hoc` (`ma_mon_hoc`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `kiem_tra_tai_lieu_1` CHECK (`trang_thai` IN ('đã tải lên','đang xử lý','sẵn sàng','thất bại','đang xóa','đã xóa','không hỗ trợ')),
  CONSTRAINT `kiem_tra_tai_lieu_2` CHECK (`so_trang` IS NULL OR `so_trang` >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `bieu_dien_noi_dung` (
  `ma_bieu_dien` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ma_dinh_danh` CHAR(64) NOT NULL,
  `ten_mo_hinh` VARCHAR(100) NOT NULL,
  `dinh_danh_chi_muc` VARCHAR(255) NOT NULL,
  `ma_trong_chi_muc` BIGINT UNSIGNED NOT NULL,
  `ngay_tao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ma_bieu_dien`),
  KEY `chi_muc_bieu_dien_noi_dung_1` (`ma_dinh_danh`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `doan_tai_lieu` (
  `ma_doan_tai_lieu` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ma_tai_lieu` BIGINT UNSIGNED NOT NULL,
  `ma_vec_to` BIGINT UNSIGNED NULL,
  `thu_tu_doan` INT UNSIGNED NOT NULL,
  `noi_dung` LONGTEXT NOT NULL,
  `ma_bam_doan` CHAR(64) NOT NULL,
  `trang_bat_dau` INT UNSIGNED NOT NULL,
  `trang_ket_thuc` INT UNSIGNED NOT NULL,
  `vi_tri_tren_trang` JSON NOT NULL,
  `ngay_tao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ma_doan_tai_lieu`),
  UNIQUE KEY `duy_nhat_doan_tai_lieu_1` (`ma_tai_lieu`,`thu_tu_doan`),
  KEY `chi_muc_doan_tai_lieu_1` (`ma_bam_doan`),
  CONSTRAINT `khoa_doan_tai_lieu_1` FOREIGN KEY (`ma_tai_lieu`) REFERENCES `tai_lieu` (`ma_tai_lieu`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `khoa_doan_tai_lieu_2` FOREIGN KEY (`ma_vec_to`) REFERENCES `bieu_dien_noi_dung` (`ma_bieu_dien`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `kiem_tra_doan_tai_lieu_1` CHECK (`trang_bat_dau` >= 1 AND `trang_ket_thuc` >= `trang_bat_dau`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `hoi_thoai` (
  `ma_hoi_thoai` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ma_mon_hoc` BIGINT UNSIGNED NOT NULL,
  `tieu_de` VARCHAR(255) NOT NULL,
  `ngay_tao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ngay_cap_nhat` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ma_hoi_thoai`),
  CONSTRAINT `khoa_hoi_thoai_1` FOREIGN KEY (`ma_mon_hoc`) REFERENCES `mon_hoc` (`ma_mon_hoc`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `luot_hoi_dap` (
  `ma_luot_hoi_dap` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ma_hoi_thoai` BIGINT UNSIGNED NOT NULL,
  `cau_hoi` LONGTEXT NOT NULL,
  `cau_hoi_truy_hoi` LONGTEXT NULL,
  `noi_dung_tra_loi` LONGTEXT NULL,
  `mo_hinh_llm` VARCHAR(100) NULL,
  `ket_qua_kiem_chung` ENUM('chưa kiểm chứng','đạt','không đạt','không đủ ngữ cảnh') NOT NULL DEFAULT 'chưa kiểm chứng',
  `trang_thai` VARCHAR(30) NOT NULL DEFAULT 'đang xử lý',
  `thoi_diem_hoi` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `thoi_diem_tra_loi` DATETIME NULL,
  PRIMARY KEY (`ma_luot_hoi_dap`),
  CONSTRAINT `khoa_luot_hoi_dap_1` FOREIGN KEY (`ma_hoi_thoai`) REFERENCES `hoi_thoai` (`ma_hoi_thoai`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `kiem_tra_luot_hoi_dap_1` CHECK (`trang_thai` IN ('đang xử lý','đã trả lời','không đủ ngữ cảnh','thất bại'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `pham_vi_hoi_dap` (
  `ma_luot_hoi_dap` BIGINT UNSIGNED NOT NULL,
  `ma_tai_lieu` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`ma_luot_hoi_dap`,`ma_tai_lieu`),
  CONSTRAINT `khoa_pham_vi_hoi_dap_1` FOREIGN KEY (`ma_luot_hoi_dap`) REFERENCES `luot_hoi_dap` (`ma_luot_hoi_dap`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `khoa_pham_vi_hoi_dap_2` FOREIGN KEY (`ma_tai_lieu`) REFERENCES `tai_lieu` (`ma_tai_lieu`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `ngu_canh_hoi_dap` (
  `ma_ngu_canh` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ma_luot_hoi_dap` BIGINT UNSIGNED NOT NULL,
  `ma_doan_tai_lieu` BIGINT UNSIGNED NOT NULL,
  `diem_tuong_dong` DECIMAL(8,6) NOT NULL,
  `thu_hang` INT UNSIGNED NOT NULL,
  `thu_tu_trich_dan` INT UNSIGNED NULL,
  `noi_dung_ngu_canh` LONGTEXT NOT NULL,
  `thong_tin_nguon` JSON NOT NULL,
  `vi_tri_trich_dan` JSON NULL,
  PRIMARY KEY (`ma_ngu_canh`),
  CONSTRAINT `khoa_ngu_canh_hoi_dap_1` FOREIGN KEY (`ma_luot_hoi_dap`) REFERENCES `luot_hoi_dap` (`ma_luot_hoi_dap`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `khoa_ngu_canh_hoi_dap_2` FOREIGN KEY (`ma_doan_tai_lieu`) REFERENCES `doan_tai_lieu` (`ma_doan_tai_lieu`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `kiem_tra_ngu_canh_hoi_dap_1` CHECK (`diem_tuong_dong` BETWEEN -1 AND 1),
  CONSTRAINT `kiem_tra_ngu_canh_hoi_dap_2` CHECK (`thu_hang` >= 1 AND (`thu_tu_trich_dan` IS NULL OR `thu_tu_trich_dan` >= 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `bai_on_tap` (
  `ma_bai_on_tap` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ma_mon_hoc` BIGINT UNSIGNED NOT NULL,
  `ten_bai_on_tap` VARCHAR(255) NOT NULL,
  `loai_bai` ENUM('trắc nghiệm','thẻ ghi nhớ') NOT NULL,
  `nguon_tao` ENUM('trí tuệ nhân tạo','thủ công','quy tắc') NOT NULL,
  `mo_hinh_tao` VARCHAR(100) NULL,
  `cau_hinh_tao` JSON NOT NULL,
  `trang_thai` VARCHAR(20) NOT NULL DEFAULT 'sẵn sàng',
  `ngay_tao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ma_bai_on_tap`),
  CONSTRAINT `khoa_bai_on_tap_1` FOREIGN KEY (`ma_mon_hoc`) REFERENCES `mon_hoc` (`ma_mon_hoc`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `kiem_tra_bai_on_tap_1` CHECK (`trang_thai` IN ('đang tạo','sẵn sàng','thất bại','đã lưu trữ'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `cau_hoi_on_tap` (
  `ma_cau_hoi` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ma_bai_on_tap` BIGINT UNSIGNED NOT NULL,
  `thu_tu` INT UNSIGNED NOT NULL,
  `noi_dung_cau_hoi` TEXT NOT NULL,
  `phuong_an` JSON NULL,
  `dap_an` TEXT NOT NULL,
  `giai_thich` TEXT NULL,
  `nguon_tham_khao` JSON NULL,
  PRIMARY KEY (`ma_cau_hoi`),
  UNIQUE KEY `duy_nhat_cau_hoi_on_tap_1` (`ma_bai_on_tap`,`thu_tu`),
  CONSTRAINT `khoa_cau_hoi_on_tap_1` FOREIGN KEY (`ma_bai_on_tap`) REFERENCES `bai_on_tap` (`ma_bai_on_tap`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `lan_lam_bai` (
  `ma_lan_lam_bai` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ma_bai_on_tap` BIGINT UNSIGNED NOT NULL,
  `ma_nguoi_dung` BIGINT UNSIGNED NOT NULL,
  `trang_thai` VARCHAR(20) NOT NULL DEFAULT 'đang làm',
  `diem` DECIMAL(5,2) NULL,
  `bat_dau_luc` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `hoan_thanh_luc` DATETIME NULL,
  PRIMARY KEY (`ma_lan_lam_bai`),
  CONSTRAINT `khoa_lan_lam_bai_1` FOREIGN KEY (`ma_bai_on_tap`) REFERENCES `bai_on_tap` (`ma_bai_on_tap`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `khoa_lan_lam_bai_2` FOREIGN KEY (`ma_nguoi_dung`) REFERENCES `nguoi_dung` (`ma_nguoi_dung`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `kiem_tra_lan_lam_bai_1` CHECK (`trang_thai` IN ('đang làm','hoàn thành')),
  CONSTRAINT `kiem_tra_lan_lam_bai_2` CHECK (`diem` IS NULL OR `diem` BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `chi_tiet_lam_bai` (
  `ma_lan_lam_bai` BIGINT UNSIGNED NOT NULL,
  `ma_cau_hoi` BIGINT UNSIGNED NOT NULL,
  `tra_loi_nguoi_dung` TEXT NULL,
  `tra_loi_dung` BOOLEAN NULL,
  `muc_do_ghi_nho` VARCHAR(20) NULL,
  `thoi_diem_tra_loi` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ma_lan_lam_bai`,`ma_cau_hoi`),
  CONSTRAINT `khoa_chi_tiet_lam_bai_1` FOREIGN KEY (`ma_lan_lam_bai`) REFERENCES `lan_lam_bai` (`ma_lan_lam_bai`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `khoa_chi_tiet_lam_bai_2` FOREIGN KEY (`ma_cau_hoi`) REFERENCES `cau_hoi_on_tap` (`ma_cau_hoi`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `kiem_tra_chi_tiet_lam_bai_1` CHECK (`muc_do_ghi_nho` IS NULL OR `muc_do_ghi_nho` IN ('học lại','khó','tốt','dễ'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `ke_hoach_hoc` (
  `ma_ke_hoach` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ma_nguoi_dung` BIGINT UNSIGNED NOT NULL,
  `ma_mon_hoc` BIGINT UNSIGNED NOT NULL,
  `ten_ke_hoach` VARCHAR(255) NOT NULL,
  `muc_tieu` TEXT NOT NULL,
  `ngay_bat_dau` DATE NOT NULL,
  `ngay_ket_thuc` DATE NOT NULL,
  `so_buoi_mong_muon` INT UNSIGNED NOT NULL,
  `dieu_kien_hoc` JSON NOT NULL,
  `trang_thai` VARCHAR(20) NOT NULL DEFAULT 'đã xác nhận',
  `ngay_tao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ma_ke_hoach`),
  CONSTRAINT `khoa_ke_hoach_hoc_1` FOREIGN KEY (`ma_nguoi_dung`) REFERENCES `nguoi_dung` (`ma_nguoi_dung`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `khoa_ke_hoach_hoc_2` FOREIGN KEY (`ma_mon_hoc`) REFERENCES `mon_hoc` (`ma_mon_hoc`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `kiem_tra_ke_hoach_hoc_1` CHECK (`ngay_ket_thuc` >= `ngay_bat_dau` AND `so_buoi_mong_muon` >= 1),
  CONSTRAINT `kiem_tra_ke_hoach_hoc_2` CHECK (`trang_thai` IN ('đã xác nhận','hoàn thành','đã hủy'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `buoi_hoc` (
  `ma_buoi_hoc` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ma_ke_hoach` BIGINT UNSIGNED NOT NULL,
  `ma_tai_lieu` BIGINT UNSIGNED NOT NULL,
  `tieu_de` VARCHAR(255) NOT NULL,
  `noi_dung_can_hoc` TEXT NOT NULL,
  `bat_dau_luc` DATETIME NOT NULL,
  `ket_thuc_luc` DATETIME NOT NULL,
  `nhac_truoc_phut` INT UNSIGNED NULL,
  `trang_thai` VARCHAR(20) NOT NULL DEFAULT 'đã lên lịch',
  `dinh_danh_su_kien_google` VARCHAR(255) NULL,
  PRIMARY KEY (`ma_buoi_hoc`),
  KEY `chi_muc_buoi_hoc_1` (`bat_dau_luc`,`ket_thuc_luc`),
  CONSTRAINT `khoa_buoi_hoc_1` FOREIGN KEY (`ma_ke_hoach`) REFERENCES `ke_hoach_hoc` (`ma_ke_hoach`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `khoa_buoi_hoc_2` FOREIGN KEY (`ma_tai_lieu`) REFERENCES `tai_lieu` (`ma_tai_lieu`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `kiem_tra_buoi_hoc_1` CHECK (`ket_thuc_luc` > `bat_dau_luc`),
  CONSTRAINT `kiem_tra_buoi_hoc_2` CHECK (`trang_thai` IN ('đã lên lịch','hoàn thành','đã hủy'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `ket_noi_google` (
  `ma_nguoi_dung` BIGINT UNSIGNED NOT NULL,
  `dinh_danh_google` VARCHAR(255) NOT NULL,
  `email_google` VARCHAR(255) NOT NULL,
  `refresh_token_ma_hoa` TEXT NULL,
  `trang_thai` VARCHAR(20) NOT NULL DEFAULT 'chưa kết nối',
  `ngay_ket_noi` DATETIME NULL,
  PRIMARY KEY (`ma_nguoi_dung`),
  UNIQUE KEY `duy_nhat_ket_noi_google_1` (`dinh_danh_google`),
  CONSTRAINT `khoa_ket_noi_google_1` FOREIGN KEY (`ma_nguoi_dung`) REFERENCES `nguoi_dung` (`ma_nguoi_dung`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `kiem_tra_ket_noi_google_1` CHECK (`trang_thai` IN ('chưa kết nối','đã kết nối','đã ngắt kết nối','cần kết nối lại'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
