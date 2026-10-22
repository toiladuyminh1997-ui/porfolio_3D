<?php
/**
 * Trang đọc một chương. Ảnh đầu chương = Ảnh đại diện; màu nền / màu nhấn trong ô "Thông tin chương".
 */
get_header();

while ( have_posts() ) :
	the_post();
	$id                 = get_the_ID();
	$label              = gtr_meta( $id, '_gtr_label', 'Chương' );
	list( $prev, $next ) = gtr_adjacent( $id );
	?>
	<style>:root{--ch-bg:<?php echo esc_html( gtr_meta( $id, '_gtr_bg', '#0b0d12' ) ); ?>;--accent:<?php echo esc_html( gtr_meta( $id, '_gtr_accent', '#c9b48a' ) ); ?>}</style>
	<div class="progress"><i></i></div>
	<header class="bar">
		<a class="bar-home" href="<?php echo esc_url( home_url( '/#muc-luc' ) ); ?>" aria-label="Mục lục">☰ <span>Mục lục</span></a>
		<div class="bar-title"><?php echo esc_html( $label . ' · ' . get_the_title() ); ?></div>
		<?php
		$content = get_post()->post_content;
		$cine    = false !== strpos( $content, 'class="cine"' );   // chương dựng sẵn hai cách đọc: Đọc + Dàn trang
		$book    = ! $cine && false !== strpos( $content, 'class="spread"' );
		?>
		<div class="bar-r">
			<?php if ( $cine ) : ?>
				<div class="mode" role="group" aria-label="Cách đọc"><button data-mode="read" class="on">Đọc</button><button data-mode="book">Dàn trang</button></div>
			<?php endif; ?>
			<button class="bar-btn" id="settings-btn" aria-label="Tuỳ chỉnh chữ">Aa</button>
		</div>
	</header>
	<div class="settings" id="settings" hidden>
		<div class="row"><span>Cỡ chữ</span><button data-size="-1">A−</button><button data-size="1">A+</button></div>
		<div class="row"><span>Nền</span><button data-theme="night">Đêm</button><button data-theme="paper">Giấy</button></div>
	</div>

	<?php if ( $cine ) : ?>
		<?php
		remove_filter( 'the_content', 'wpautop' );   // HTML dựng sẵn (cảnh + trang đôi), không chèn <p>/<br>
		the_content();
		?>
	<?php elseif ( $book ) : ?>
		<div class="book-head">
			<div class="ch-label"><?php echo esc_html( $label ); ?></div>
			<h1><?php the_title(); ?></h1>
			<div class="ch-en"><?php echo esc_html( gtr_meta( $id, '_gtr_title_en' ) ); ?></div>
			<div class="ch-meta"><?php echo (int) substr_count( $content, 'class="spread"' ); ?> trang đôi · <?php echo (int) gtr_reading_minutes( get_post() ); ?> phút đọc</div>
		</div>
		<main class="spreads" id="prose">
			<?php
			remove_filter( 'the_content', 'wpautop' );   // HTML trang đôi đã hoàn chỉnh, không chèn <p>/<br>
			the_content();
			?>
		</main>
	<?php else : // chương viết tay trong WordPress: kiểu đọc chữ liền mạch ?>
		<section class="ch-hero">
			<?php if ( has_post_thumbnail() ) : ?>
				<div class="ch-hero-img"><?php the_post_thumbnail( 'full', array( 'sizes' => '100vw', 'loading' => false, 'fetchpriority' => 'high' ) ); ?></div>
			<?php else : ?>
				<div class="ch-hero-img ch-hero-empty"></div>
			<?php endif; ?>
			<div class="ch-hero-text">
				<div class="ch-label"><?php echo esc_html( $label ); ?></div>
				<h1><?php the_title(); ?></h1>
				<div class="ch-en"><?php echo esc_html( gtr_meta( $id, '_gtr_title_en' ) ); ?></div>
				<div class="ch-meta"><?php echo (int) gtr_reading_minutes( get_post() ); ?> phút đọc</div>
			</div>
			<div class="scroll-cue">Cuộn để đọc</div>
		</section>
		<article class="prose" id="prose">
			<?php the_content(); ?>
			<div class="end-mark">✦</div>
		</article>
	<?php endif; ?>

	<nav class="ch-nav">
		<?php if ( $prev ) : ?>
			<a class="prev" href="<?php echo esc_url( get_permalink( $prev ) ); ?>"><span>← <?php echo esc_html( gtr_meta( $prev->ID, '_gtr_label', 'Chương trước' ) ); ?></span><?php echo esc_html( get_the_title( $prev ) ); ?></a>
		<?php else : ?>
			<span></span>
		<?php endif; ?>
		<?php if ( $next ) : ?>
			<a class="next" href="<?php echo esc_url( get_permalink( $next ) ); ?>"><span><?php echo esc_html( gtr_meta( $next->ID, '_gtr_label', 'Chương sau' ) ); ?> →</span><?php echo esc_html( get_the_title( $next ) ); ?></a>
		<?php else : ?>
			<a class="next" href="<?php echo esc_url( home_url( '/#muc-luc' ) ); ?>"><span>Hết phần đã đăng</span>Quay về mục lục</a>
		<?php endif; ?>
	</nav>

	<div class="resume" id="resume" hidden><span>Đọc tiếp từ chỗ bạn dừng lại?</span><button id="resume-yes">Đọc tiếp</button><button id="resume-no" aria-label="Đóng">✕</button></div>
	<?php
endwhile;

get_footer();
