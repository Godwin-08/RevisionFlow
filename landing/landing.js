document.addEventListener('DOMContentLoaded', () => {
    /* --- Navbar Scroll & Parallax Effects --- */
    const navbar = document.getElementById('navbar');
    const parallaxLayers = document.querySelectorAll('.hero-parallax-layer');
    const heroPreview = document.querySelector('.hero-preview');
    const scrollProgress = document.getElementById('scroll-progress');

    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const percentage = (scrolled / height) * 100;
        if (scrollProgress) scrollProgress.style.width = `${percentage}%`;

        navbar.classList.toggle('scrolled', scrolled > 20);
        if (scrolled < 150) {
            navbar.classList.remove('nav-red', 'nav-green', 'nav-blue');
        }

        if (scrolled < window.innerHeight) {
            parallaxLayers.forEach(layer => {
                const speed = parseFloat(layer.dataset.speed);
                const offset = scrolled * speed;
                layer.style.transform = `translate3d(0, ${offset}px, 0)`;
            });
        }

        if (heroPreview) {
            const threshold = 300;
            const blurVal = Math.min(scrolled / 50, 8);
            const opacityVal = Math.max(1 - scrolled / 800, 0.2);
            heroPreview.style.filter = scrolled > threshold ? `blur(${blurVal}px)` : 'none';
            heroPreview.style.opacity = scrolled > threshold ? opacityVal : 1;
        }
    });

    /* --- Intersection Observer for Scroll Reveals --- */
    const revealOptions = { threshold: 0.15, rootMargin: '0px 0px -100px 0px' };
    const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                const delay = parseInt(e.target.dataset.delay) || 0;
                setTimeout(() => e.target.classList.add('visible'), delay);
            } else {
                e.target.classList.remove('visible');
            }
        });
    }, revealOptions);

    document.querySelectorAll('.section-inner').forEach(el => obs.observe(el));
    document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach(el => obs.observe(el));
    document.querySelectorAll('.problem-card, .feature-card').forEach((el, i) => {
        el.dataset.delay = (i % 3) * 150;
        obs.observe(el);
    });
    document.querySelectorAll('.step-item').forEach((el, i) => {
        el.dataset.delay = i * 150;
        obs.observe(el);
    });

    /* --- Mini Dashboard Counter Animation --- */
    function animateCounter(el, target, duration = 1500) {
        if (!el) return;
        const start = performance.now();
        const easeOutQuint = t => 1 - Math.pow(1 - t, 5);
        const tick = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const value = Math.round(target * easeOutQuint(progress));
            el.textContent = value;
            if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    const previewObs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            const prog = document.getElementById('prog');
            if (e.isIntersecting) {
                animateCounter(document.getElementById('s1'), 12);
                animateCounter(document.getElementById('s2'), 8);
                animateCounter(document.getElementById('s3'), 14);
                if (prog) prog.style.width = '68%';
            } else {
                const s1 = document.getElementById('s1');
                const s2 = document.getElementById('s2');
                const s3 = document.getElementById('s3');
                if (s1) s1.textContent = '0';
                if (s2) s2.textContent = '0';
                if (s3) s3.textContent = '0';
                if (prog) prog.style.width = '0%';
            }
        });
    }, { threshold: 0.5 });

    const heroPreviewEl = document.querySelector('.hero-preview');
    if (heroPreviewEl) previewObs.observe(heroPreviewEl);

    const navColorObs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const sectionId = entry.target.id;
                navbar.classList.remove('nav-red', 'nav-green', 'nav-blue');
                if (sectionId === 'problem') navbar.classList.add('nav-red');
                else if (sectionId === 'features') navbar.classList.add('nav-green');
                else if (sectionId === 'how') navbar.classList.add('nav-blue');
            }
        });
    }, { rootMargin: '-80px 0px -80% 0px' });

    document.querySelectorAll('#problem, #features, #how').forEach(s => navColorObs.observe(s));

    /* --- Magnetic Button Effect --- */
    const magneticBtn = document.querySelector('.nav-cta');
    if (magneticBtn) {
        magneticBtn.addEventListener('mousemove', (e) => {
            const rect = magneticBtn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            const xMove = x * 0.35;
            const yMove = y * 0.35;
            magneticBtn.style.transform = `translate(${xMove}px, ${yMove}px)`;
        });
        magneticBtn.addEventListener('mouseleave', () => {
            magneticBtn.style.transform = 'translate(0px, 0px)';
        });
    }
});