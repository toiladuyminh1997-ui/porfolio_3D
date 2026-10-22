<?php
/**
 * Kiểu bài viết "Chương" (chuong) và các thông tin riêng của mỗi chương.
 * Thứ tự chương = "Thứ tự" (menu_order) trong ô Thuộc tính trang.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const GTR_META = array(
	'_gtr_label'    => array( 'Nhãn chương', 'Chương 1', 'text' ),
	'_gtr_title_en' => array( 'Tên tiếng Anh', 'The Evergreen Garden', 'text' ),
	'_gtr_bg'       => array( 'Màu nền trang đọc', '#0b0d12', 'color' ),
	'_gtr_accent'   => array( 'Màu nhấn', '#c9b48a', 'color' ),
);

function gtr_register_cpt() {
	register_post_type( 'chuong', array(
		'labels'       => array(
			'name'               => 'Chương',
			'singular_name'      => 'Chương',
			'add_new'            => 'Thêm chương',
			'add_new_item'       => 'Thêm chương mới',
			'edit_item'          => 'Sửa chương',
			'new_item'           => 'Chương mới',
			'view_item'          => 'Xem chương',
			'search_items'       => 'Tìm chương',
			'not_found'          => 'Chưa có chương nào',
			'all_items'          => 'Tất cả chương',
			'menu_name'          => 'Sách',
		),
		'public'       => true,
		'show_in_rest' => true,
		'menu_icon'    => 'dashicons-book-alt',
		'menu_position'=> 5,
		'hierarchical' => false,
		'supports'     => array( 'title', 'editor', 'thumbnail', 'page-attributes', 'excerpt' ),
		'rewrite'      => array( 'slug' => 'chuong' ),
		'has_archive'  => false,
	) );
	register_post_meta( 'chuong', '_gtr_n', array(
		'type'          => 'integer',
		'single'        => true,
		'show_in_rest'  => true,
		'auth_callback' => function () {
			return current_user_can( 'edit_posts' );
		},
	) );
	foreach ( array_keys( GTR_META ) as $key ) {
		register_post_meta( 'chuong', $key, array(
			'type'          => 'string',
			'single'        => true,
			'show_in_rest'  => true,
			'auth_callback' => function () {
				return current_user_can( 'edit_posts' );
			},
		) );
	}
}
add_action( 'init', 'gtr_register_cpt' );

add_action( 'after_switch_theme', function () {
	gtr_register_cpt();
	flush_rewrite_rules();
} );

/* ---------- ô "Thông tin chương" trong trang sửa chương ---------- */
add_action( 'add_meta_boxes', function () {
	add_meta_box( 'gtr_chapter', 'Thông tin chương', 'gtr_meta_box', 'chuong', 'side', 'high' );
} );

function gtr_meta_box( $post ) {
	wp_nonce_field( 'gtr_chapter_save', 'gtr_chapter_nonce' );
	foreach ( GTR_META as $key => list( $label, $example, $type ) ) {
		$val = get_post_meta( $post->ID, $key, true );
		printf(
			'<p><label for="%1$s"><strong>%2$s</strong></label><br><input type="%3$s" id="%1$s" name="%1$s" value="%4$s" placeholder="%5$s" style="width:100%%"></p>',
			esc_attr( $key ), esc_html( $label ), esc_attr( $type ), esc_attr( $val ? $val : ( 'color' === $type ? $example : '' ) ), esc_attr( $example )
		);
	}
	echo '<p class="description">Ảnh đầu chương = Ảnh đại diện. Thứ tự chương = ô "Thứ tự" trong Thuộc tính.</p>';
}

add_action( 'save_post_chuong', function ( $post_id ) {
	if ( ! isset( $_POST['gtr_chapter_nonce'] ) || ! wp_verify_nonce( sanitize_key( $_POST['gtr_chapter_nonce'] ), 'gtr_chapter_save' ) ) {
		return;
	}
	if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}
	foreach ( GTR_META as $key => list( , , $type ) ) {
		if ( ! isset( $_POST[ $key ] ) ) {
			continue;
		}
		$raw = wp_unslash( $_POST[ $key ] );
		$val = 'color' === $type ? sanitize_hex_color( $raw ) : sanitize_text_field( $raw );
		update_post_meta( $post_id, $key, (string) $val );
	}
} );

/* Thêm cột nhãn chương trong danh sách chương, sắp theo thứ tự đọc */
add_filter( 'manage_chuong_posts_columns', function ( $cols ) {
	return array_slice( $cols, 0, 1, true ) + array( 'gtr_label' => 'Nhãn' ) + array_slice( $cols, 1, null, true );
} );
add_action( 'manage_chuong_posts_custom_column', function ( $col, $id ) {
	if ( 'gtr_label' === $col ) {
		echo esc_html( get_post_meta( $id, '_gtr_label', true ) );
	}
}, 10, 2 );
add_action( 'pre_get_posts', function ( $q ) {
	if ( is_admin() && $q->is_main_query() && 'chuong' === $q->get( 'post_type' ) && ! $q->get( 'orderby' ) ) {
		$q->set( 'orderby', 'menu_order' );
		$q->set( 'order', 'ASC' );
	}
} );

/* ---------- hàm dùng trong giao diện ---------- */
function gtr_meta( $id, $key, $default = '' ) {
	$v = get_post_meta( $id, $key, true );
	return '' === $v || null === $v ? $default : $v;
}

/** Các chương đã đăng, theo thứ tự đọc. */
function gtr_chapters() {
	return get_posts( array(
		'post_type'      => 'chuong',
		'post_status'    => 'publish',
		'posts_per_page' => -1,
		'orderby'        => array( 'menu_order' => 'ASC', 'date' => 'ASC' ),
	) );
}

/** Số chữ (đếm theo khoảng trắng — hợp với tiếng Việt). */
function gtr_word_count( $post ) {
	// chương có hai cách đọc: chỉ đếm phần "Đọc", bỏ bản dàn trang (cùng chữ, lặp lại)
	$text = trim( wp_strip_all_tags( preg_replace( '#<div class="book".*$#s', '', $post->post_content ) ) );
	return '' === $text ? 0 : count( preg_split( '/\s+/u', $text ) );
}

function gtr_reading_minutes( $post ) {
	return max( 1, (int) round( gtr_word_count( $post ) / 200 ) );
}

/** Chương trước / sau theo thứ tự đọc. */
function gtr_adjacent( $id ) {
	$all = gtr_chapters();
	foreach ( $all as $i => $p ) {
		if ( $p->ID === $id ) {
			return array( $all[ $i - 1 ] ?? null, $all[ $i + 1 ] ?? null );
		}
	}
	return array( null, null );
}
