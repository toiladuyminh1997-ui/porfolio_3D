<?php
/**
 * Trang dự phòng (bài viết thường, trang tĩnh, tìm kiếm...) — dùng khung chữ của trang đọc.
 */
get_header();
?>
<header class="bar solid">
	<a class="bar-home" href="<?php echo esc_url( home_url( '/#muc-luc' ) ); ?>">☰ <span>Mục lục</span></a>
	<div class="bar-title"><?php bloginfo( 'name' ); ?></div>
	<span></span>
</header>
<main class="prose" style="padding-top:120px">
	<?php if ( have_posts() ) : ?>
		<?php while ( have_posts() ) : the_post(); ?>
			<article <?php post_class(); ?>>
				<h1 style="font-family:var(--serif);font-weight:400"><?php is_singular() ? the_title() : printf( '<a href="%s">%s</a>', esc_url( get_permalink() ), esc_html( get_the_title() ) ); ?></h1>
				<?php is_singular() ? the_content() : the_excerpt(); ?>
			</article>
		<?php endwhile; ?>
		<?php the_posts_pagination(); ?>
	<?php else : ?>
		<p>Không tìm thấy nội dung. <a href="<?php echo esc_url( home_url( '/' ) ); ?>">Về trang chủ</a>.</p>
	<?php endif; ?>
</main>
<?php
get_footer();
