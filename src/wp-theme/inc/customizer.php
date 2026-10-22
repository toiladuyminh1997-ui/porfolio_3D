<?php
/**
 * Giao diện > Tùy biến > Trang sách: chữ trên trang chủ.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const GTR_TEXT = array(
	'gtr_title'    => array( 'Tên sách', 'Gã Thợ Rèn Ở Xứ Sở Thần Kỳ', 'text' ),
	'gtr_title_en' => array( 'Tên tiếng Anh', 'The Blacksmith of Wonderland', 'text' ),
	'gtr_kicker'   => array( 'Dòng nhỏ trên tên sách', 'Tiểu thuyết giả tưởng · Minh hoạ 3D', 'text' ),
	'gtr_intro'    => array( 'Đoạn giới thiệu (%d = số chương)', 'Một tiểu thuyết giả tưởng phương Bắc, minh hoạ hoàn toàn bằng 3D. %d chương đầu đã có thể đọc trực tuyến.', 'textarea' ),
	'gtr_tagline'  => array( 'Câu trích dẫn', 'Ngươi thật sự muốn kết thúc ở đây sao?', 'text' ),
	'gtr_upcoming' => array( 'Chương sắp ra mắt (mỗi dòng: Nhãn|Tên)', 'Chương 10|Đang được viết…', 'textarea' ),
	'gtr_footer'   => array( 'Dòng chân trang', 'Mọi hình minh hoạ được dựng bằng 3D · Sách đang được viết tiếp', 'text' ),
);

function gtr_text( $key ) {
	return get_theme_mod( $key, GTR_TEXT[ $key ][1] );
}

add_action( 'customize_register', function ( $wp_customize ) {
	$wp_customize->add_section( 'gtr_book', array(
		'title'    => 'Trang sách',
		'priority' => 30,
	) );
	foreach ( GTR_TEXT as $key => list( $label, $default, $type ) ) {
		$wp_customize->add_setting( $key, array(
			'default'           => $default,
			'sanitize_callback' => 'textarea' === $type ? 'sanitize_textarea_field' : 'sanitize_text_field',
			'transport'         => 'refresh',
		) );
		$wp_customize->add_control( $key, array(
			'label'   => $label,
			'section' => 'gtr_book',
			'type'    => $type,
		) );
	}
} );
