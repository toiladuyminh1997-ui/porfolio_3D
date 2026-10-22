<?php
/**
 * Theme "Gã Thợ Rèn Ở Xứ Sở Thần Kỳ".
 *
 * - inc/chapters.php   kiểu bài viết "Chương" + ô thông tin chương (nhãn, tên tiếng Anh, màu)
 * - inc/customizer.php chữ trên trang chủ (Giao diện > Tùy biến > Trang sách)
 * - inc/import.php     Giao diện > Nhập sách: đưa chương + ảnh trong book/ vào WordPress
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'GTR_VER', '1.2.0' );
define( 'GTR_DIR', get_template_directory() );
define( 'GTR_URI', get_template_directory_uri() );
define( 'GTR_FONTS', 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Literata:ital,wght@0,400;0,600;1,400&family=Lora:ital,wght@0,400;1,400&family=Roboto+Flex:wght@400&family=Be+Vietnam+Pro:wght@300;400;500&display=swap&subset=vietnamese' );

require GTR_DIR . '/inc/chapters.php';
require GTR_DIR . '/inc/customizer.php';
require GTR_DIR . '/inc/import.php';

add_action( 'after_setup_theme', function () {
	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'html5', array( 'style', 'script', 'gallery', 'caption' ) );
} );

/* Lớp CSS cho <body>: trang chủ dùng giao diện lợn rừng, trang chương dùng giao diện đọc. */
add_filter( 'body_class', function ( $classes ) {
	if ( is_front_page() ) {
		$classes[] = 'home';
		$classes[] = 'home-boar';
	}
	if ( is_singular( 'chuong' ) ) {
		$classes[] = 'reader';
	}
	return $classes;
} );

add_action( 'wp_enqueue_scripts', function () {
	wp_enqueue_style( 'gtr-fonts', GTR_FONTS, array(), null );
	wp_enqueue_style( 'gtr-style', GTR_URI . '/assets/style.css', array(), GTR_VER );

	if ( is_front_page() ) {
		$v = GTR_URI . '/assets/vendor/';
		wp_enqueue_script( 'gsap', $v . 'gsap/gsap.min.js', array(), '3.12.5', true );
		wp_enqueue_script( 'gsap-scrolltrigger', $v . 'gsap/ScrollTrigger.min.js', array( 'gsap' ), '3.12.5', true );
		wp_enqueue_script( 'lenis', $v . 'lenis/lenis.min.js', array(), '1.1.13', true );
		wp_enqueue_script( 'gtr-home', GTR_URI . '/assets/home.js', array( 'gsap', 'gsap-scrolltrigger', 'lenis' ), GTR_VER, true );
		wp_add_inline_script( 'gtr-home', 'window.MODEL_URL = ' . wp_json_encode( GTR_URI . '/models/boar.glb' )
			. '; window.MODEL_URL_M = ' . wp_json_encode( GTR_URI . '/models/boar-m.glb' ) . ';', 'before' );   // bản nhẹ cho điện thoại
		gtr_enqueue_boar();
	}

	if ( is_singular( 'chuong' ) ) {
		wp_enqueue_script( 'gtr-reader', GTR_URI . '/assets/reader.js', array(), GTR_VER, true );
		wp_add_inline_script( 'gtr-reader', 'window.CHAPTER = ' . (int) get_queried_object_id() . ';', 'before' );
	}
} );

/**
 * Lợn rừng 3D (assets/hero-boar.js) là ES module dùng three.js đi kèm theme.
 * WordPress 6.5+ có sẵn hệ thống script module (tự in importmap); bản cũ hơn thì in tay.
 */
function gtr_enqueue_boar() {
	$three = GTR_URI . '/assets/vendor/three/';
	$mods  = array(
		'three'                                        => $three . 'build/three.module.min.js',
		'three/addons/loaders/GLTFLoader.js'           => $three . 'examples/jsm/loaders/GLTFLoader.js',
		'three/addons/environments/RoomEnvironment.js' => $three . 'examples/jsm/environments/RoomEnvironment.js',
	);
	if ( function_exists( 'wp_enqueue_script_module' ) ) {
		foreach ( $mods as $id => $src ) {
			wp_register_script_module( $id, $src, 'three' === $id ? array() : array( 'three' ), '0.160.0' );
		}
		wp_enqueue_script_module( 'gtr-hero-boar', GTR_URI . '/assets/hero-boar.js', array_keys( $mods ), GTR_VER );
		return;
	}
	add_action( 'wp_footer', function () use ( $mods ) {
		printf( '<script type="importmap">%s</script>', wp_json_encode( array( 'imports' => $mods ) ) );
		printf( '<script type="module" src="%s"></script>', esc_url( GTR_URI . '/assets/hero-boar.js?ver=' . GTR_VER ) );
	}, 5 );
}

/** Tách chữ thành từng ký tự (hiệu ứng chữ trượt lên ở tiêu đề trang chủ), giữ nguyên từ để không ngắt giữa chữ. */
function gtr_split_letters( $text ) {
	$out = array();
	foreach ( preg_split( '/\s+/u', trim( $text ) ) as $word ) {
		$chars = '';
		foreach ( preg_split( '//u', $word, -1, PREG_SPLIT_NO_EMPTY ) as $c ) {
			$chars .= '<span class="ch">' . esc_html( $c ) . '</span>';
		}
		$out[] = '<span class="word">' . $chars . '</span>';
	}
	return implode( ' ', $out );
}

/** Tách chữ thành từng từ (câu trích dẫn sáng dần khi cuộn). */
function gtr_split_words( $text ) {
	$out = array();
	foreach ( preg_split( '/\s+/u', trim( $text ) ) as $word ) {
		$out[] = '<span class="w">' . esc_html( $word ) . '</span>';
	}
	return implode( ' ', $out );
}
