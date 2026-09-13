from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('clinics', '0017_storefrontbooking_customer_user'),
    ]

    operations = [
        migrations.AddField(
            model_name='storefrontbooking',
            name='cancelled_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='cancelled_reason',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='completed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='confirmed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='confirmed_appointment',
            field=models.ForeignKey(blank=True, help_text='الموعد المؤكد الناتج عن طلب الحجز', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='storefront_bookings', to='clinics.veterinaryappointment'),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='pet_age',
            field=models.CharField(blank=True, max_length=80, null=True),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='pet_breed',
            field=models.CharField(blank=True, max_length=120, null=True),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='pet_photo',
            field=models.ImageField(blank=True, null=True, upload_to='clinics/bookings/pets/'),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='pet_type',
            field=models.CharField(blank=True, max_length=60, null=True),
        ),
        migrations.AlterField(
            model_name='storefrontbooking',
            name='status',
            field=models.CharField(choices=[('new', 'جديد'), ('counter_proposed', 'تم اقتراح موعد بديل'), ('confirmed', 'مؤكد'), ('completed', 'مكتمل'), ('cancelled', 'ملغي')], default='new', max_length=20),
        ),
        migrations.CreateModel(
            name='StorefrontBookingProposal',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('proposed_date', models.DateField()),
                ('proposed_time', models.TimeField()),
                ('duration_minutes', models.PositiveIntegerField(default=30)),
                ('note', models.TextField(blank=True, null=True)),
                ('status', models.CharField(choices=[('pending', 'قيد الانتظار'), ('accepted', 'تم القبول'), ('declined', 'تم الرفض'), ('cancelled', 'ملغي'), ('expired', 'منتهي')], default='pending', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('responded_at', models.DateTimeField(blank=True, null=True)),
                ('booking', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='proposals', to='clinics.storefrontbooking')),
                ('proposed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='clinic_booking_proposals', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'اقتراح موعد حجز',
                'verbose_name_plural': 'اقتراحات مواعيد الحجوزات',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='storefrontbookingproposal',
            index=models.Index(fields=['booking', 'status', '-created_at'], name='clinics_sto_booking_498422_idx'),
        ),
    ]
