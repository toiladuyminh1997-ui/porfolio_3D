<?php
/**
 * Trang chủ: lợn rừng 3D (assets/hero-boar.js) + tên sách + câu trích dẫn + mục lục.
 * Cấu trúc HTML giống bản web tĩnh để dùng chung assets/style.css, home.js, hero-boar.js.
 */
get_header();

$chapters = gtr_chapters();
$total    = 0;
foreach ( $chapters as $c ) {
	$total += gtr_word_count( $c );
}
$first = $chapters ? $chapters[0] : null;
$cover = $first && has_post_thumbnail( $first ) ? get_the_post_thumbnail( $first, 'full', array( 'sizes' => '100vw', 'loading' => false ) ) : '';
$intro = sprintf( gtr_text( 'gtr_intro' ), count( $chapters ) );
?>
<div class="cursor-img" id="cursor-img"><img alt=""></div>
<header class="bar bar-home-page">
	<a class="brand" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php echo esc_html( gtr_text( 'gtr_title_en' ) ); ?></a>
	<nav><a href="#muc-luc">Mục lục</a><a href="#" id="continue-link" hidden>Đọc tiếp</a></nav>
</header>

<div class="aurora" aria-hidden="true"></div>
<canvas id="boar" aria-label="Lợn rừng 3D"></canvas>
<section class="hero" id="hero">
	<div class="hero-img"><?php echo $cover; // ảnh dự phòng khi máy không chạy được 3D ?></div>
	<div class="hero-text">
		<div class="hero-kicker"><?php echo esc_html( gtr_text( 'gtr_kicker' ) ); ?></div>
		<h1 class="hero-title"><?php echo gtr_split_letters( gtr_text( 'gtr_title' ) ); ?></h1>
		<div class="hero-en"><?php echo esc_html( gtr_text( 'gtr_title_en' ) ); ?></div>
	</div>
	<p class="hero-intro"><?php echo esc_html( $intro ); ?></p>
	<div class="scroll-cue">Cuộn để bước vào</div>
</section>

<section class="quote">
	<p class="quote-text"><?php echo gtr_split_words( gtr_text( 'gtr_tagline' ) ); ?></p>
	<?php if ( $first ) : ?>
		<a class="btn" href="<?php echo esc_url( get_permalink( $first ) ); ?>">Bắt đầu đọc</a>
	<?php endif; ?>
</section>

<section class="toc" id="muc-luc">
	<div class="toc-head">
		<h2>Mục lục</h2>
		<span><?php echo count( $chapters ); ?> chương · <?php echo esc_html( number_format( $total, 0, ',', '.' ) ); ?> chữ</span>
	</div>
	<div class="toc-list">
		<?php if ( ! $chapters && current_user_can( 'manage_options' ) ) : ?>
			<p class="toc-row">Chưa có chương nào — vào <a href="<?php echo esc_url( admin_url( 'themes.php?page=gtr-import' ) ); ?>">&nbsp;Giao diện &gt; Nhập sách</a>.</p>
		<?php endif; ?>
		<?php foreach ( $chapters as $c ) : ?>
			<a class="toc-row" href="<?php echo esc_url( get_permalink( $c ) ); ?>"
				data-bg="<?php echo esc_attr( gtr_meta( $c->ID, '_gtr_bg', '#0b0d12' ) ); ?>"
				data-accent="<?php echo esc_attr( gtr_meta( $c->ID, '_gtr_accent', '#c9b48a' ) ); ?>"
				data-img="<?php echo esc_url( (string) get_the_post_thumbnail_url( $c, 'large' ) ); ?>">
				<span class="toc-n"><?php echo esc_html( gtr_meta( $c->ID, '_gtr_label', 'Chương' ) ); ?></span>
				<span class="toc-t"><?php echo esc_html( get_the_title( $c ) ); ?><em><?php echo esc_html( gtr_meta( $c->ID, '_gtr_title_en' ) ); ?></em></span>
				<span class="toc-m"><?php echo (int) gtr_reading_minutes( $c ); ?> phút</span>
			</a>
		<?php endforeach; ?>
		<?php
		foreach ( array_filter( array_map( 'trim', explode( "\n", (string) gtr_text( 'gtr_upcoming' ) ) ) ) as $line ) :
			list( $label, $name ) = array_pad( explode( '|', $line, 2 ), 2, '' );
			?>
			<div class="toc-row toc-soon">
				<span class="toc-n"><?php echo esc_html( $label ); ?></span>
				<span class="toc-t"><?php echo esc_html( $name ); ?></span>
				<span class="toc-m">Sắp ra mắt</span>
			</div>
		<?php endforeach; ?>
	</div>
</section>

<footer class="foot">
	<div><?php echo esc_html( gtr_text( 'gtr_title' ) ); ?></div>
	<div class="foot-sub"><?php echo esc_html( gtr_text( 'gtr_footer' ) ); ?></div>
</footer>
<?php
get_footer();
