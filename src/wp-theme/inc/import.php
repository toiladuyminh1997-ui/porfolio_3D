<?php
/**
 * Giao diện > Nhập sách
 * Đưa nội dung trong thư mục book/ của theme vào WordPress:
 *   - ảnh trong book/img/  -> Thư viện Media (mỗi ảnh chỉ nhập một lần)
 *   - book/chapters.json   -> các bài "Chương" (tạo mới hoặc cập nhật theo số chương)
 * book/ được tạo bằng: python tools/build.py --wp
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'admin_menu', function () {
	add_theme_page( 'Nhập sách', 'Nhập sách', 'manage_options', 'gtr-import', 'gtr_import_page' );
} );

/* Nhắc nhập sách khi theme vừa kích hoạt mà chưa có chương nào */
add_action( 'admin_notices', function () {
	if ( ! current_user_can( 'manage_options' ) || ( isset( $_GET['page'] ) && 'gtr-import' === $_GET['page'] ) ) {
		return;
	}
	$count = wp_count_posts( 'chuong' );
	if ( $count && ( $count->publish + $count->draft ) > 0 ) {
		return;
	}
	printf(
		'<div class="notice notice-info"><p>Theme sách đã sẵn sàng. <a href="%s">Vào Giao diện &gt; Nhập sách</a> để đưa các chương và ảnh minh hoạ vào trang.</p></div>',
		esc_url( admin_url( 'themes.php?page=gtr-import' ) )
	);
} );

function gtr_book_data() {
	$file = GTR_DIR . '/book/chapters.json';
	if ( ! file_exists( $file ) ) {
		return null;
	}
	return json_decode( file_get_contents( $file ), true );
}

function gtr_find_chapter( $n ) {
	$found = get_posts( array(
		'post_type'   => 'chuong',
		'post_status' => 'any',
		'numberposts' => 1,
		'meta_query'  => array( array( 'key' => '_gtr_n', 'value' => (int) $n, 'type' => 'NUMERIC' ) ),   // chạy đúng cả với Prologue (số 0)
		'fields'      => 'ids',
	) );
	return $found ? (int) $found[0] : 0;
}

/** Nhập một ảnh từ book/img vào Thư viện Media (không tạo thêm các cỡ ảnh phụ cho nhanh). */
function gtr_import_media( $rel, &$map, &$stats ) {
	if ( ! empty( $map[ $rel ] ) && get_post( $map[ $rel ] ) ) {
		return (int) $map[ $rel ];
	}
	$src = GTR_DIR . '/book/img/' . $rel;
	if ( ! file_exists( $src ) ) {
		$stats['missing'][] = $rel;
		return 0;
	}
	$name = 'gtr-' . str_replace( '/', '-', $rel );
	$up   = wp_upload_bits( $name, null, file_get_contents( $src ) );
	if ( ! empty( $up['error'] ) ) {
		$stats['errors'][] = $rel . ': ' . $up['error'];
		return 0;
	}
	$type = wp_check_filetype( $up['file'] );
	$id   = wp_insert_attachment( array(
		'post_mime_type' => $type['type'] ? $type['type'] : 'image/webp',
		'post_title'     => pathinfo( $name, PATHINFO_FILENAME ),
		'post_status'    => 'inherit',
	), $up['file'] );
	if ( is_wp_error( $id ) || ! $id ) {
		$stats['errors'][] = $rel;
		return 0;
	}
	add_filter( 'intermediate_image_sizes_advanced', '__return_empty_array' );
	wp_update_attachment_metadata( $id, wp_generate_attachment_metadata( $id, $up['file'] ) );
	remove_filter( 'intermediate_image_sizes_advanced', '__return_empty_array' );
	$map[ $rel ] = $id;
	$stats['images']++;
	return $id;
}

function gtr_run_import( $overwrite ) {
	@set_time_limit( 0 );
	require_once ABSPATH . 'wp-admin/includes/image.php';
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/media.php';

	$data  = gtr_book_data();
	$stats = array( 'created' => 0, 'updated' => 0, 'skipped' => 0, 'images' => 0, 'missing' => array(), 'errors' => array() );
	if ( ! $data ) {
		$stats['errors'][] = 'Không tìm thấy book/chapters.json trong thư mục theme.';
		return $stats;
	}
	$map = get_option( 'gtr_media_map', array() );

	// chữ trên trang chủ: lấy từ sách nếu chưa tự chỉnh trong Tùy biến
	foreach ( array( 'title' => 'gtr_title', 'title_en' => 'gtr_title_en', 'tagline' => 'gtr_tagline' ) as $k => $mod ) {
		if ( ! empty( $data['book'][ $k ] ) && false === get_theme_mod( $mod, false ) ) {
			set_theme_mod( $mod, $data['book'][ $k ] );
		}
	}
	if ( ! empty( $data['upcoming'] ) && false === get_theme_mod( 'gtr_upcoming', false ) ) {
		set_theme_mod( 'gtr_upcoming', implode( "\n", array_map( function ( $u ) {
			return $u['label'] . '|' . $u['title'];
		}, $data['upcoming'] ) ) );
	}

	kses_remove_filters();   // nội dung chương là HTML do build tạo (figure, srcset, data-reveal)
	foreach ( $data['chapters'] as $ch ) {
		$existing = gtr_find_chapter( $ch['n'] );
		if ( $existing && ! $overwrite ) {
			$stats['skipped']++;
			continue;
		}
		$html = preg_replace_callback( '/\{\{img:([^}]+)\}\}/', function ( $m ) use ( &$map, &$stats ) {
			$id = gtr_import_media( $m[1], $map, $stats );
			return $id ? wp_get_attachment_url( $id ) : '';
		}, $ch['html'] );

		$post = array(
			'post_type'    => 'chuong',
			'post_title'   => $ch['title'],
			'post_name'    => sanitize_title( $ch['label'] ),
			'post_content' => $html,
			'post_status'  => $ch['published'] ? 'publish' : 'draft',
			'menu_order'   => (int) $ch['n'],
		);
		if ( $existing ) {
			$post['ID'] = $existing;
		}
		$id = wp_insert_post( wp_slash( $post ), true );
		if ( is_wp_error( $id ) ) {
			$stats['errors'][] = $ch['label'] . ': ' . $id->get_error_message();
			continue;
		}
		$existing ? $stats['updated']++ : $stats['created']++;
		update_post_meta( $id, '_gtr_n', (int) $ch['n'] );
		update_post_meta( $id, '_gtr_label', $ch['label'] );
		update_post_meta( $id, '_gtr_title_en', $ch['title_en'] );
		update_post_meta( $id, '_gtr_bg', $ch['bg'] );
		update_post_meta( $id, '_gtr_accent', $ch['accent'] );
		if ( ! empty( $ch['hero'] ) ) {
			$hero = gtr_import_media( $ch['hero'], $map, $stats );
			if ( $hero ) {
				set_post_thumbnail( $id, $hero );
			}
		}
		update_option( 'gtr_media_map', $map, false );   // lưu dần: nếu bị ngắt giữa chừng, lần sau nhập tiếp
	}
	kses_init_filters();
	flush_rewrite_rules();
	return $stats;
}

function gtr_import_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$data  = gtr_book_data();
	$stats = null;
	if ( isset( $_POST['gtr_import'] ) && check_admin_referer( 'gtr_import' ) ) {
		$stats = gtr_run_import( ! empty( $_POST['gtr_overwrite'] ) );
	}
	$n_imgs = is_dir( GTR_DIR . '/book/img' )
		? iterator_count( new RecursiveIteratorIterator( new RecursiveDirectoryIterator( GTR_DIR . '/book/img', FilesystemIterator::SKIP_DOTS ) ) )
		: 0;
	?>
	<div class="wrap">
		<h1>Nhập sách</h1>
		<?php if ( $stats ) : ?>
			<div class="notice <?php echo $stats['errors'] ? 'notice-warning' : 'notice-success'; ?>"><p>
				Đã tạo <?php echo (int) $stats['created']; ?> chương, cập nhật <?php echo (int) $stats['updated']; ?>,
				bỏ qua <?php echo (int) $stats['skipped']; ?>; nhập <?php echo (int) $stats['images']; ?> ảnh mới vào Thư viện Media.
				<?php if ( $stats['missing'] ) : ?><br>Thiếu ảnh: <?php echo esc_html( implode( ', ', array_slice( $stats['missing'], 0, 5 ) ) ); ?><?php endif; ?>
				<?php if ( $stats['errors'] ) : ?><br>Lỗi: <?php echo esc_html( implode( '; ', array_slice( $stats['errors'], 0, 5 ) ) ); ?><?php endif; ?>
				<br><a href="<?php echo esc_url( home_url( '/' ) ); ?>">Xem trang chủ</a> ·
				<a href="<?php echo esc_url( admin_url( 'edit.php?post_type=chuong' ) ); ?>">Danh sách chương</a>
			</p></div>
		<?php endif; ?>

		<?php if ( ! $data ) : ?>
			<p>Không tìm thấy <code>book/chapters.json</code> trong thư mục theme.</p>
		<?php else : ?>
			<p>Gói sách đi kèm theme có <strong><?php echo count( $data['chapters'] ); ?> chương</strong>
				và <strong><?php echo (int) $n_imgs; ?> ảnh minh hoạ</strong>.</p>
			<p>Bấm nút dưới đây để đưa ảnh vào Thư viện Media và tạo các bài <a href="<?php echo esc_url( admin_url( 'edit.php?post_type=chuong' ) ); ?>">Chương</a>.
				Ảnh đã nhập sẽ không bị nhập lại. Có thể mất một hai phút.</p>
			<form method="post">
				<?php wp_nonce_field( 'gtr_import' ); ?>
				<p><label><input type="checkbox" name="gtr_overwrite" value="1" checked>
					Ghi đè các chương đã có (mất những chỉnh sửa đã làm trong WordPress cho các chương đó)</label></p>
				<?php submit_button( 'Nhập sách', 'primary', 'gtr_import' ); ?>
			</form>
			<h2>Khi viết thêm chương</h2>
			<ol>
				<li>Cách nhanh: vào <strong>Sách &gt; Thêm chương</strong>, viết nội dung, điền ô <em>Thông tin chương</em>, chọn Ảnh đại diện làm ảnh đầu chương, đặt ô <em>Thứ tự</em> = số chương.</li>
				<li>Hoặc dựng lại từ bản dàn trang: chạy <code>python tools/build.py --wp</code>, tải theme mới lên, rồi vào đây bấm Nhập sách (bỏ chọn "Ghi đè" để giữ các chương đã sửa tay).</li>
			</ol>
		<?php endif; ?>
	</div>
	<?php
}
