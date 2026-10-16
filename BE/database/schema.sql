-- Vietnamese schema v1: MySQL8 / InnoDB. Fresh development database only.

SET NAMES utf8mb4;

CREATE TABLE `nguoi_dung` (
  `ma` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ho_ten` varchar(100) NOT NULL,
  `email` varchar(254) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `mat_khau_bam` varchar(60) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `khoa_anh_dai_dien` varchar(255) DEFAULT NULL,
  `vai_tro` enum('student','admin') NOT NULL DEFAULT 'student',
  `trang_thai` enum('active','blocked') NOT NULL DEFAULT 'active',
  `ngay_tao` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ngay_cap_nhat` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`ma`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `phien_dang_nhap` (
  `ma` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ma_nguoi_dung` bigint unsigned NOT NULL,
  `ma_bam_token` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `token_chong_csrf` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `luc_het_han` datetime(3) NOT NULL,
  `luc_thu_hoi` datetime(3) DEFAULT NULL,
  `ngay_tao` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`ma`),
  UNIQUE KEY `uq_sessions_token_hash` (`ma_bam_token`),
  KEY `ix_sessions_user` (`ma_nguoi_dung`),
  KEY `ix_sessions_expiry` (`luc_het_han`),
  CONSTRAINT `fk_session_user` FOREIGN KEY (`ma_nguoi_dung`) REFERENCES `nguoi_dung` (`ma`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `mon_hoc` (
  `ma` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ma_nguoi_dung` bigint unsigned NOT NULL,
  `ten` varchar(150) NOT NULL,
  `mo_ta` varchar(2000) NOT NULL DEFAULT '',
  `ngay_tao` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ngay_cap_nhat` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`ma`),
  UNIQUE KEY `uq_courses_owner` (`ma`,`ma_nguoi_dung`),
  KEY `ix_courses_user_name` (`ma_nguoi_dung`,`ten`),
  CONSTRAINT `fk_courses_user` FOREIGN KEY (`ma_nguoi_dung`) REFERENCES `nguoi_dung` (`ma`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tai_lieu` (
  `ma` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ma_mon_hoc` bigint unsigned NOT NULL,
  `ma_nguoi_dung` bigint unsigned NOT NULL,
  `ten_tep_goc` varchar(255) NOT NULL,
  `khoa_luu_tru` char(40) NOT NULL,
  `kieu_tep` varchar(100) NOT NULL DEFAULT 'application/pdf',
  `kich_thuoc_byte` bigint unsigned NOT NULL,
  `ma_bam_sha256` char(64) NOT NULL,
  `so_trang` int unsigned DEFAULT NULL,
  `trang_thai` enum('queued','extracting','chunking','embedding','indexing','ready','failed','unsupported','deleting','deleted') NOT NULL DEFAULT 'queued',
  `luc_trich_xuat_xong` datetime(3) DEFAULT NULL,
  `khoa_trich_xuat` varchar(90) DEFAULT NULL,
  `ma_loi` varchar(64) DEFAULT NULL,
  `thong_bao_loi` varchar(255) DEFAULT NULL,
  `luc_xoa` datetime(3) DEFAULT NULL,
  `ngay_tao` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ngay_cap_nhat` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `ma_tep_dam_may` varchar(255) DEFAULT NULL,
  `loai_tep_dam_may` enum('raw','image') DEFAULT NULL,
  UNIQUE KEY `uq_tai_lieu_cloud` (`ma_tep_dam_may`),
  CONSTRAINT `ck_tai_lieu_cloud_pair` CHECK ((`ma_tep_dam_may` IS NULL AND `loai_tep_dam_may` IS NULL) OR (`ma_tep_dam_may` IS NOT NULL AND `loai_tep_dam_may` IS NOT NULL)),
  PRIMARY KEY (`ma`),
  UNIQUE KEY `uq_documents_storage` (`khoa_luu_tru`),
  KEY `ix_documents_owner_course` (`ma_nguoi_dung`,`ma_mon_hoc`,`ngay_tao`),
  KEY `fk_documents_course_owner` (`ma_mon_hoc`,`ma_nguoi_dung`),
  KEY `ix_dashboard_documents` (`ngay_tao`,`ma`),
  CONSTRAINT `fk_documents_course_owner` FOREIGN KEY (`ma_mon_hoc`, `ma_nguoi_dung`) REFERENCES `mon_hoc` (`ma`, `ma_nguoi_dung`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `van_ban_pdf` (
  `ma_tai_lieu` bigint unsigned NOT NULL,
  `du_lieu_trich_xuat` longtext NOT NULL,
  PRIMARY KEY (`ma_tai_lieu`),
  CONSTRAINT `fk_extraction_document` FOREIGN KEY (`ma_tai_lieu`) REFERENCES `tai_lieu` (`ma`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `doan_tai_lieu` (
  `ma` char(64) NOT NULL,
  `ma_tai_lieu` bigint unsigned NOT NULL,
  `thu_tu_doan` int unsigned NOT NULL,
  `noi_dung` mediumtext NOT NULL,
  `tu_trang` int unsigned NOT NULL,
  `den_trang` int unsigned NOT NULL,
  `so_token` int unsigned NOT NULL,
  `vi_tri_dau` int unsigned NOT NULL,
  `vi_tri_cuoi` int unsigned NOT NULL,
  `anh_xa_trang` json NOT NULL,
  `mo_hinh_embedding` varchar(200) NOT NULL,
  `phien_ban_embedding` char(40) NOT NULL,
  `khoa_vector` varchar(200) DEFAULT NULL,
  PRIMARY KEY (`ma`),
  UNIQUE KEY `uq_chunk_document_order` (`ma_tai_lieu`,`thu_tu_doan`),
  CONSTRAINT `fk_chunk_document` FOREIGN KEY (`ma_tai_lieu`) REFERENCES `tai_lieu` (`ma`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `chi_muc_tim_kiem` (
  `ma_mon_hoc` bigint unsigned NOT NULL,
  `ma_nguoi_dung` bigint unsigned NOT NULL,
  `phien_ban` char(64) NOT NULL,
  `mo_hinh` varchar(200) NOT NULL,
  `phien_ban_mo_hinh` char(40) NOT NULL,
  `so_chieu` int unsigned NOT NULL,
  `phep_do` varchar(20) NOT NULL,
  `khoa_manifest` varchar(200) NOT NULL,
  `ngay_cap_nhat` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`ma_mon_hoc`),
  KEY `fk_index_course_owner` (`ma_mon_hoc`,`ma_nguoi_dung`),
  CONSTRAINT `fk_index_course_owner` FOREIGN KEY (`ma_mon_hoc`, `ma_nguoi_dung`) REFERENCES `mon_hoc` (`ma`, `ma_nguoi_dung`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tac_vu_pdf` (
  `ma` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ma_tai_lieu` bigint unsigned NOT NULL,
  `loai_tac_vu` enum('upload_pdf','extract_pdf','prepare_source','delete_pdf') NOT NULL,
  `trang_thai` enum('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
  `so_lan_thu` int unsigned NOT NULL DEFAULT '0',
  `ma_tien_trinh_khoa` char(36) DEFAULT NULL,
  `khoa_den_luc` datetime(3) DEFAULT NULL,
  `luc_chay_tiep` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `loi_gan_nhat` varchar(64) DEFAULT NULL,
  `ngay_tao` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ngay_cap_nhat` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`ma`),
  UNIQUE KEY `uq_processing_document_type` (`ma_tai_lieu`,`loai_tac_vu`),
  KEY `ix_processing_claim` (`trang_thai`,`luc_chay_tiep`,`khoa_den_luc`),
  CONSTRAINT `fk_processing_document` FOREIGN KEY (`ma_tai_lieu`) REFERENCES `tai_lieu` (`ma`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `hoi_thoai` (
  `ma` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ma_mon_hoc` bigint unsigned NOT NULL,
  `ma_nguoi_dung` bigint unsigned NOT NULL,
  `tieu_de` varchar(150) NOT NULL DEFAULT 'Há»™i thoáº¡i má»›i',
  `ngay_tao` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ngay_cap_nhat` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`ma`),
  KEY `fk_conversation_owner` (`ma_mon_hoc`,`ma_nguoi_dung`),
  CONSTRAINT `fk_conversation_owner` FOREIGN KEY (`ma_mon_hoc`, `ma_nguoi_dung`) REFERENCES `mon_hoc` (`ma`, `ma_nguoi_dung`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tin_nhan` (
  `ma` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ma_hoi_thoai` bigint unsigned NOT NULL,
  `ma_yeu_cau` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `ma_bam_dau_vao` char(64) NOT NULL,
  `vai_tro` enum('user','assistant') NOT NULL,
  `noi_dung` mediumtext NOT NULL,
  `trang_thai` enum('processing','answered','insufficient_context','failed') NOT NULL,
  `ma_loi` varchar(80) DEFAULT NULL,
  `ma_trang_thai_loi` smallint unsigned DEFAULT NULL,
  `mo_hinh` varchar(200) DEFAULT NULL,
  `do_tre_ms` int unsigned DEFAULT NULL,
  `ngay_tao` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `nguon_tra_loi` enum('grounded','general','unknown') NOT NULL DEFAULT 'unknown',
  `cac_khoi_tra_loi` json DEFAULT NULL,
  PRIMARY KEY (`ma`),
  UNIQUE KEY `uq_qa_request` (`ma_hoi_thoai`,`ma_yeu_cau`,`vai_tro`),
  KEY `ix_qa_created` (`ngay_tao`),
  KEY `ix_dashboard_qa` (`vai_tro`,`ngay_tao`,`trang_thai`,`do_tre_ms`),
  CONSTRAINT `fk_message_conversation` FOREIGN KEY (`ma_hoi_thoai`) REFERENCES `hoi_thoai` (`ma`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `nguon_tra_loi` (
  `ma` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ma_tin_nhan` bigint unsigned NOT NULL,
  `ma_doan` char(64) DEFAULT NULL,
  `ma_tai_lieu` bigint unsigned DEFAULT NULL,
  `ten_tep_nguon` varchar(255) NOT NULL,
  `tu_trang` int unsigned NOT NULL,
  `den_trang` int unsigned NOT NULL,
  `noi_dung_nguon_chup_lai` mediumtext NOT NULL,
  `diem` double NOT NULL,
  PRIMARY KEY (`ma`),
  KEY `fk_citation_message` (`ma_tin_nhan`),
  KEY `fk_citation_chunk` (`ma_doan`),
  KEY `fk_citation_document` (`ma_tai_lieu`),
  CONSTRAINT `fk_citation_chunk` FOREIGN KEY (`ma_doan`) REFERENCES `doan_tai_lieu` (`ma`) ON DELETE SET NULL,
  CONSTRAINT `fk_citation_document` FOREIGN KEY (`ma_tai_lieu`) REFERENCES `tai_lieu` (`ma`) ON DELETE SET NULL,
  CONSTRAINT `fk_citation_message` FOREIGN KEY (`ma_tin_nhan`) REFERENCES `tin_nhan` (`ma`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `luot_hoi_dap` (
  `ma` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ma_nguoi_dung` bigint unsigned NOT NULL,
  `luc_tinh_luot` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ma_tin_nhan_cu` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`ma`),
  UNIQUE KEY `uq_usage_legacy` (`ma_tin_nhan_cu`),
  KEY `ix_usage_owner_time` (`ma_nguoi_dung`,`luc_tinh_luot`),
  CONSTRAINT `fk_usage_user` FOREIGN KEY (`ma_nguoi_dung`) REFERENCES `nguoi_dung` (`ma`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `bo_hoc_tap` (
  `ma` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ma_mon_hoc` bigint unsigned NOT NULL,
  `ma_nguoi_dung` bigint unsigned NOT NULL,
  `loai` enum('quiz','flashcards') NOT NULL,
  `tieu_de` varchar(150) NOT NULL,
  `mo_hinh` varchar(200) NOT NULL,
  `so_nguon` int unsigned NOT NULL,
  `ngay_tao` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`ma`),
  KEY `ix_learning_owner` (`ma_nguoi_dung`,`ma_mon_hoc`,`ma`),
  KEY `fk_learning_owner` (`ma_mon_hoc`,`ma_nguoi_dung`),
  CONSTRAINT `fk_learning_owner` FOREIGN KEY (`ma_mon_hoc`, `ma_nguoi_dung`) REFERENCES `mon_hoc` (`ma`, `ma_nguoi_dung`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `muc_hoc_tap` (
  `ma` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ma_bo_hoc` bigint unsigned NOT NULL,
  `vi_tri` int unsigned NOT NULL,
  `cau_hoi_hoac_mat_truoc` text NOT NULL,
  `dap_an_hoac_mat_sau` text NOT NULL,
  `cac_lua_chon` json DEFAULT NULL,
  `vi_tri_dap_an_dung` tinyint unsigned DEFAULT NULL,
  `giai_thich` text,
  PRIMARY KEY (`ma`),
  UNIQUE KEY `uq_learning_position` (`ma_bo_hoc`,`vi_tri`),
  CONSTRAINT `fk_learning_item_set` FOREIGN KEY (`ma_bo_hoc`) REFERENCES `bo_hoc_tap` (`ma`) ON DELETE CASCADE,
  CONSTRAINT `ck_learning_correct` CHECK (((`vi_tri_dap_an_dung` is null) or (`vi_tri_dap_an_dung` < 4)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `nguon_hoc_tap` (
  `ma` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ma_noi_dung` bigint unsigned NOT NULL,
  `ma_doan` char(64) DEFAULT NULL,
  `ma_tai_lieu` bigint unsigned DEFAULT NULL,
  `ten_tep_nguon` varchar(255) NOT NULL,
  `tu_trang` int unsigned NOT NULL,
  `den_trang` int unsigned NOT NULL,
  `noi_dung_nguon_chup_lai` mediumtext NOT NULL,
  PRIMARY KEY (`ma`),
  KEY `fk_learning_citation_item` (`ma_noi_dung`),
  KEY `fk_learning_citation_chunk` (`ma_doan`),
  KEY `fk_learning_citation_document` (`ma_tai_lieu`),
  CONSTRAINT `fk_learning_citation_chunk` FOREIGN KEY (`ma_doan`) REFERENCES `doan_tai_lieu` (`ma`) ON DELETE SET NULL,
  CONSTRAINT `fk_learning_citation_document` FOREIGN KEY (`ma_tai_lieu`) REFERENCES `tai_lieu` (`ma`) ON DELETE SET NULL,
  CONSTRAINT `fk_learning_citation_item` FOREIGN KEY (`ma_noi_dung`) REFERENCES `muc_hoc_tap` (`ma`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `yeu_cau_tao_bo` (
  `ma` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ma_nguoi_dung` bigint unsigned NOT NULL,
  `ma_mon_hoc` bigint unsigned NOT NULL,
  `ma_yeu_cau` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `ma_bam_dau_vao` char(64) NOT NULL,
  `tinh_trang` enum('processing','completed','failed') NOT NULL,
  `ma_bo_hoc` bigint unsigned DEFAULT NULL,
  `ma_loi` varchar(80) DEFAULT NULL,
  `ma_trang_thai_loi` smallint unsigned DEFAULT NULL,
  `ngay_tao` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`ma`),
  UNIQUE KEY `uq_learning_generation` (`ma_nguoi_dung`,`ma_yeu_cau`),
  KEY `ix_learning_quota` (`ma_nguoi_dung`,`ngay_tao`),
  KEY `fk_learning_generation_owner` (`ma_mon_hoc`,`ma_nguoi_dung`),
  KEY `fk_learning_generation_set` (`ma_bo_hoc`),
  CONSTRAINT `fk_learning_generation_owner` FOREIGN KEY (`ma_mon_hoc`, `ma_nguoi_dung`) REFERENCES `mon_hoc` (`ma`, `ma_nguoi_dung`),
  CONSTRAINT `fk_learning_generation_set` FOREIGN KEY (`ma_bo_hoc`) REFERENCES `bo_hoc_tap` (`ma`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `lan_lam_bai` (
  `ma` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ma_bo_hoc` bigint unsigned NOT NULL,
  `ma_nguoi_dung` bigint unsigned NOT NULL,
  `ma_yeu_cau` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `diem` decimal(5,2) DEFAULT NULL,
  `so_cau_dung` int unsigned DEFAULT NULL,
  `tong_so_cau` int unsigned NOT NULL,
  `ma_bam_bai_nop` char(64) DEFAULT NULL,
  `luc_bat_dau` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `luc_hoan_thanh` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`ma`),
  UNIQUE KEY `uq_learning_attempt` (`ma_nguoi_dung`,`ma_yeu_cau`),
  KEY `fk_learning_attempt_set` (`ma_bo_hoc`),
  CONSTRAINT `fk_learning_attempt_set` FOREIGN KEY (`ma_bo_hoc`) REFERENCES `bo_hoc_tap` (`ma`) ON DELETE CASCADE,
  CONSTRAINT `fk_learning_attempt_user` FOREIGN KEY (`ma_nguoi_dung`) REFERENCES `nguoi_dung` (`ma`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `dap_an_da_chon` (
  `ma_lan_lam` bigint unsigned NOT NULL,
  `ma_noi_dung` bigint unsigned NOT NULL,
  `lua_chon` tinyint unsigned DEFAULT NULL,
  `dung_sai` tinyint(1) NOT NULL,
  PRIMARY KEY (`ma_lan_lam`,`ma_noi_dung`),
  KEY `fk_learning_answer_item` (`ma_noi_dung`),
  CONSTRAINT `fk_learning_answer_attempt` FOREIGN KEY (`ma_lan_lam`) REFERENCES `lan_lam_bai` (`ma`) ON DELETE CASCADE,
  CONSTRAINT `fk_learning_answer_item` FOREIGN KEY (`ma_noi_dung`) REFERENCES `muc_hoc_tap` (`ma`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `nhat_ky_quan_tri` (
  `ma` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ma_nguoi_thuc_hien` bigint unsigned NOT NULL,
  `hanh_dong` varchar(80) NOT NULL,
  `loai_doi_tuong` varchar(40) NOT NULL,
  `ma_doi_tuong` bigint unsigned NOT NULL,
  `du_lieu_bo_sung` json NOT NULL,
  `ngay_tao` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`ma`),
  KEY `ix_audit_entity` (`loai_doi_tuong`,`ma_doi_tuong`,`ngay_tao`),
  KEY `fk_audit_actor` (`ma_nguoi_thuc_hien`),
  KEY `ix_dashboard_audit` (`ngay_tao`,`ma`),
  CONSTRAINT `fk_audit_actor` FOREIGN KEY (`ma_nguoi_thuc_hien`) REFERENCES `nguoi_dung` (`ma`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
